// Faux serveur Subagent pour les tests : mêmes routes, mêmes refus, aucune messagerie derrière.
//
// Il contrôle chaque appel comme le serveur (origine, clé, permission, état de l'espace,
// paramètres inconnus, schéma d'entrée, idempotence) et rend la sortie d'exemple de l'opération.
// Il n'envoie rien et n'appelle personne. Les opérations, leurs schémas et leurs exemples viennent
// de registre-de-test.json, généré depuis le registre d'opérations du serveur.
//
// Dans un test :
//     const serveur = await new FauxServeur().demarrer();
//     ... serveur.url ... ; await serveur.arreter();
//
// Seul, pour essayer un script à la main :
//     node tests/faux-serveur.mjs        (écoute sur http://127.0.0.1:8787)

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const REGISTRE = JSON.parse(readFileSync(new URL("./registre-de-test.json", import.meta.url), "utf8"));
export const OPERATIONS = REGISTRE.operations;

export const CLE_AGENT = "sak_exemple_agent"; // la clé que rend sign_up : send, read, manage_inboxes
export const CLE_HUMAIN = "sak_exemple_humain"; // la clé d'un humain : les mêmes, plus approve
const CLES = {
  [CLE_AGENT]: ["send", "read", "manage_inboxes"],
  [CLE_HUMAIN]: ["send", "read", "manage_inboxes", "approve"],
};
export const DESTINATAIRE_BLOQUE = "desinscrit@exemple.com"; // tout envoi vers lui est refusé
export const FIL_RECU = "thr_5c1d9e3b7a2f4c6e8b0d1f3a5c7e9b2d"; // le fil d'un e-mail reçu en premier (list_threads, status open)

class Refus extends Error {
  constructor(statut, code, message, hint) {
    super(message);
    Object.assign(this, { statut, code, hint });
  }
  corps() {
    const erreur = { code: this.code, message: this.message };
    if (this.hint) erreur.hint = this.hint;
    return { error: erreur };
  }
}

const invalide = (message, hint) => new Refus(400, "invalid_argument", message, hint);

/** Contrôle une valeur contre le schéma du paramètre (la partie de JSON Schema que le serveur emploie). */
function controler(nom, schema, valeur) {
  switch (schema.type) {
    case "string":
      if (typeof valeur !== "string") throw invalide(`${nom} doit être un texte.`);
      if (schema.maxLength !== undefined && [...valeur].length > schema.maxLength) {
        throw invalide(`${nom} est trop long : ${[...valeur].length} caractères, ${schema.maxLength} au plus.`);
      }
      if (schema.pattern && !new RegExp(schema.pattern).test(valeur)) {
        throw invalide(`${nom} invalide : « ${valeur} ».`, `Attendu : ${schema.pattern}`);
      }
      if (schema.enum && !schema.enum.includes(valeur)) {
        throw invalide(`${nom} invalide : « ${valeur} ».`, `Valeurs acceptées : ${schema.enum.join(", ")}.`);
      }
      return;
    case "boolean":
      if (typeof valeur !== "boolean") throw invalide(`${nom} doit être true ou false.`);
      return;
    case "integer":
      if (!Number.isInteger(valeur)) throw invalide(`${nom} doit être un entier.`);
      if (valeur < (schema.minimum ?? valeur) || valeur > (schema.maximum ?? valeur)) {
        throw invalide(`${nom} doit être un entier entre ${schema.minimum} et ${schema.maximum}.`);
      }
      return;
    case "object":
      if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) {
        throw invalide(`${nom} doit être un objet JSON.`);
      }
      return;
    case "array":
      if (!Array.isArray(valeur)) throw invalide(`${nom} doit être une liste.`);
      if (schema.maxItems !== undefined && valeur.length > schema.maxItems) {
        throw invalide(`${nom} : ${schema.maxItems} éléments au plus.`);
      }
      return;
    default:
      throw new Error(`type de paramètre non pris en charge par le faux serveur : ${schema.type}`);
  }
}

export class FauxServeur {
  requetes = []; // chaque appel accepté : { operation, entetes, arguments }
  connexions = 0; // nombre de requêtes HTTP reçues, pannes comprises
  pannes = 0; // nombre de prochaines connexions coupées sans réponse
  passerelles = 0; // nombre de prochaines réponses 502 sans corps d'erreur Subagent
  lenteur = 0; // millisecondes d'attente avant chaque réponse
  verifie = true; // l'espace des clés d'exemple est vérifié (sign_up le remet à false)
  url = "";
  #idempotence = new Map();
  #http;

  constructor() {
    this.#http = createServer((requete, reponse) => {
      const morceaux = [];
      requete.on("data", (morceau) => morceaux.push(morceau));
      requete.on("end", () => {
        this.connexions += 1;
        if (this.pannes > 0) {
          this.pannes -= 1;
          requete.socket.destroy();
          return;
        }
        if (this.passerelles > 0) {
          this.passerelles -= 1;
          reponse.writeHead(502, { "Content-Type": "text/html" }).end("<html>Bad Gateway</html>");
          return;
        }
        let statut = 200;
        let corps;
        try {
          corps = this.#appeler(requete.url, requete.headers, Buffer.concat(morceaux).toString("utf8"));
        } catch (erreur) {
          if (!(erreur instanceof Refus)) throw erreur;
          statut = erreur.statut;
          corps = erreur.corps();
        }
        const entetes = { "Content-Type": "application/json" };
        if (statut === 401) entetes["WWW-Authenticate"] = 'Bearer realm="subagent"';
        const ecrire = () => reponse.writeHead(statut, entetes).end(JSON.stringify(corps));
        if (this.lenteur > 0) setTimeout(ecrire, this.lenteur);
        else ecrire();
      });
    });
  }

  demarrer(port = 0) {
    return new Promise((resolve) => {
      this.#http.listen(port, "127.0.0.1", () => {
        this.url = `http://127.0.0.1:${this.#http.address().port}`;
        resolve(this);
      });
    });
  }

  arreter() {
    return new Promise((resolve) => {
      this.#http.closeAllConnections?.();
      this.#http.close(() => resolve());
    });
  }

  get derniere() {
    return this.requetes[this.requetes.length - 1];
  }

  // Un appel, dans l'ordre des contrôles du serveur.
  #appeler(chemin, entetes, corps) {
    if (!chemin.startsWith("/v1/")) throw new Refus(404, "unknown_operation", `Route inconnue : ${chemin}.`);
    const nom = chemin.slice("/v1/".length);
    const operation = OPERATIONS[nom];
    if (entetes.origin) {
      throw new Refus(
        403,
        "origin_refused",
        "Origine refusée : cette API ne s’appelle pas depuis la page web d’un autre site.",
        "Appelez-la depuis votre agent ou votre serveur, sans en-tête Origin.",
      );
    }
    const nonAutorise = new Refus(
      401,
      "unauthorized",
      "Clé d’API absente, inconnue ou révoquée.",
      "Envoyez l’en-tête Authorization: Bearer sak_… avec votre clé. Pas encore de clé ? sign_up en ouvre une, sans clé.",
    );
    let permissions;
    if (entetes.authorization !== undefined) {
      const porteur = entetes.authorization;
      permissions = porteur.startsWith("Bearer ") ? CLES[porteur.slice("Bearer ".length)] : undefined;
      if (!permissions) throw nonAutorise;
    }
    if (!permissions && !operation?.sans_cle) throw nonAutorise;
    let args;
    try {
      args = corps.trim() ? JSON.parse(corps) : {};
    } catch {
      throw invalide(
        "Corps JSON illisible.",
        "Envoyez un objet JSON : les arguments de l’opération (voir /openapi.json).",
      );
    }
    const proprietes = operation?.entree.properties ?? {};
    const estObjet = typeof args === "object" && args !== null && !Array.isArray(args);
    const cleEntete = entetes["idempotency-key"];
    if (cleEntete && estObjet && "idempotency_key" in proprietes && !("idempotency_key" in args)) {
      args.idempotency_key = cleEntete;
    }
    this.requetes.push({ operation: nom, entetes: { ...entetes }, arguments: args });
    if (!operation) {
      throw new Refus(
        404,
        "unknown_operation",
        `Opération inconnue : ${nom}.`,
        "La liste des opérations est dans tools/list (MCP), /openapi.json ou /llms.txt.",
      );
    }
    if (!operation.sans_cle) {
      if (!operation.permissions.some((permission) => permissions.includes(permission))) {
        throw new Refus(
          403,
          "forbidden",
          `${nom} demande la permission ${operation.permissions.join(" ou ")}, que cette clé n’a pas.`,
          operation.permissions.length === 1 && operation.permissions[0] === "approve"
            ? "La validation est un geste humain : un humain l’accomplit depuis son assistant, avec une clé qui porte approve."
            : "Demandez à un administrateur de Subagent une clé qui porte cette permission.",
        );
      }
      if (operation.espace === "vérifié" && !this.verifie) {
        throw new Refus(
          403,
          "space_unverified",
          "Espace non vérifié : ses boîtes reçoivent, mais n’envoient pas.",
          "Demandez à votre humain le code à 6 chiffres reçu par e-mail, puis appelez verify.",
        );
      }
      if (operation.espace === "non vérifié" && this.verifie) {
        throw new Refus(409, "already_verified", "Espace déjà vérifié.", "Rien à faire : l’envoi est ouvert.");
      }
    }
    if (args === null) args = {};
    if (typeof args !== "object" || Array.isArray(args)) throw invalide("Les arguments doivent être un objet JSON.");
    for (const cle of Object.keys(args)) {
      if (!(cle in proprietes)) {
        throw invalide(
          `Paramètre inconnu : ${cle}.`,
          `Paramètres acceptés par ${nom} : ${Object.keys(proprietes).sort().join(", ")}.`,
        );
      }
    }
    args = Object.fromEntries(Object.entries(args).filter(([, valeur]) => valeur !== null));
    for (const cle of operation.entree.required ?? []) {
      if (!(cle in args)) throw invalide(`${cle} est obligatoire.`);
    }
    for (const [cle, valeur] of Object.entries(args)) controler(cle, proprietes[cle], valeur);
    const exige = (operation.entree.required ?? []).includes("confirm") || (nom === "campaign_action" && args.action === "start");
    if (exige && args.confirm !== true) {
      throw invalide("confirm doit valoir true : l’opération est irréversible.");
    }
    if (args.to === DESTINATAIRE_BLOQUE) {
      throw new Refus(
        422,
        "recipient_suppressed",
        `Destinataire bloqué : ${DESTINATAIRE_BLOQUE} s’est désinscrit.`,
        "Ne lui écrivez plus, depuis aucune boîte.",
      );
    }
    return this.#repondre(nom, args);
  }

  #repondre(nom, args) {
    const cle = args.idempotency_key;
    const { idempotency_key: _, ...reste } = args;
    const contenu = JSON.stringify(Object.keys(reste).sort().map((k) => [k, reste[k]]));
    const repere = `${nom} ${cle}`;
    if (cle !== undefined && this.#idempotence.has(repere)) {
      const ancien = this.#idempotence.get(repere);
      if (ancien.contenu !== contenu) {
        throw new Refus(
          409,
          "idempotency_conflict",
          `La clé d’idempotence « ${cle} » a déjà servi pour un contenu différent.`,
          "Même message : réutilisez la clé telle quelle. Nouveau message : prenez-en une nouvelle.",
        );
      }
      return { ...ancien.reponse, replayed: true };
    }
    const reponse = structuredClone(OPERATIONS[nom].exemple);
    if (nom === "sign_up") {
      this.verifie = false;
      reponse.api_key = CLE_AGENT;
    }
    if (nom === "verify") this.verifie = true;
    if (nom === "list_threads" && args.status === "open") {
      // Un e-mail reçu en premier : il ouvre un fil `open`, d'origine `inbound`, jamais `replied`.
      for (const fil of reponse.items) {
        Object.assign(fil, {
          id: FIL_RECU,
          status: "open",
          origin: "inbound",
          subject: "Demande de devis",
          last_outbound_at: null,
          last_inbound_at: fil.last_message_at,
        });
      }
    }
    const message = reponse.message;
    if (message && typeof message === "object" && "text" in args) {
      for (const champ of ["to", "subject", "text", "reply_to"]) {
        if (champ in args) message[champ] = args[champ];
      }
      if (args.requires_approval) {
        message.status = "draft";
        reponse.estimated_send_at = null;
      }
    }
    if (cle !== undefined) this.#idempotence.set(repere, { contenu, reponse });
    return reponse;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const faux = await new FauxServeur().demarrer(Number(process.argv[2] ?? 8787));
  console.log(`Faux serveur Subagent : ${faux.url}  (clés : ${CLE_AGENT}, ${CLE_HUMAIN} ; Ctrl+C pour arrêter)`);
}
