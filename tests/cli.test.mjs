// La commande, lancée pour de vrai (un processus par appel) contre le faux serveur.
//
//     npm test

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import { CLE_AGENT, CLE_HUMAIN, DESTINATAIRE_BLOQUE, FauxServeur } from "./faux-serveur.mjs";

const COMMANDE = fileURLToPath(new URL("../bin/subagent.mjs", import.meta.url));
const BOITE = "inb_3f9c2a7e5b1d4c8e9a0f6b2d7c4e1a95";
const MESSAGE = "msg_7f2a91c4e8b34d0fa6c25e1b9d3f7a48";
const ENVOI = ["--inbox_id", BOITE, "--to", "nadia.morel@exemple.com", "--subject", "Rendez-vous de jeudi", "--text", "Bonjour, …"];

let serveur;
beforeEach(async () => {
  serveur = await new FauxServeur().demarrer();
});
afterEach(() => serveur.arreter());

/** Lance `subagent …` et rend { code, sortie, erreur }. */
function lancer(args, { cle = CLE_AGENT, env = {}, cwd, entree } = {}) {
  return new Promise((resolve) => {
    const environnement = { ...process.env, SUBAGENT_BASE_URL: serveur.url, ...env };
    delete environnement.SUBAGENT_KEY;
    if (cle) environnement.SUBAGENT_KEY = cle;
    const enfant = execFile(process.execPath, [COMMANDE, ...args], { env: environnement, cwd }, (echec, sortie, erreur) => {
      resolve({ code: echec ? echec.code : 0, sortie, erreur });
    });
    if (entree !== undefined) enfant.stdin.end(entree);
  });
}

describe("aide", () => {
  test("sans argument : l'usage et la liste des opérations", async () => {
    const { code, sortie } = await lancer([]);
    assert.equal(code, 0);
    assert.match(sortie, /subagent <opération>/);
    for (const nom of ["sign_up", "inbox_status", "send_email", "approve_message", "list_suppressions"]) {
      assert.ok(sortie.includes(nom), nom);
    }
    assert.equal(serveur.connexions, 0);
  });

  test("l'aide d'une opération donne ses paramètres", async () => {
    const { code, sortie } = await lancer(["send_email", "--help"]);
    assert.equal(code, 0);
    assert.match(sortie, /--inbox_id <texte> {2}\(obligatoire\)/);
    assert.match(sortie, /--requires_approval <booléen>/);
    assert.match(sortie, /Accès : permission send/);
    assert.equal((await lancer(["help", "send-email"])).sortie, sortie);
  });

  test("--version", async () => {
    const { sortie } = await lancer(["--version"]);
    assert.match(sortie, /^\d+\.\d+\.\d+\n$/);
  });
});

describe("appel", () => {
  test("le résultat sort en JSON, la clé part en en-tête", async () => {
    const { code, sortie, erreur } = await lancer(["inbox_status"]);
    assert.equal(code, 0, erreur);
    assert.ok(Array.isArray(JSON.parse(sortie).inboxes));
    assert.equal(serveur.derniere.entetes.authorization, `Bearer ${CLE_AGENT}`);
    assert.match(serveur.derniere.entetes["user-agent"], /^subagent-mail-cli\//);
  });

  test("tirets ou soulignés, --nom valeur ou --nom=valeur", async () => {
    await lancer(["list-threads", "--inbox-id", BOITE, "--status=replied", "--limit", "5"]);
    assert.equal(serveur.derniere.operation, "list_threads");
    assert.deepEqual(serveur.derniere.arguments, { inbox_id: BOITE, status: "replied", limit: 5 });
  });

  test("un booléen sans valeur vaut true", async () => {
    await lancer(["send_email", ...ENVOI, "--requires_approval", "--test", "false"]);
    assert.equal(serveur.derniere.arguments.requires_approval, true);
    assert.equal(serveur.derniere.arguments.test, false);
  });

  test("--json donne les arguments, un paramètre nommé l'emporte", async () => {
    const json = JSON.stringify({ inbox_id: BOITE, to: "a@exemple.fr", subject: "Sujet", text: "Texte" });
    await lancer(["send_email", "--json", json, "--to", "nadia.morel@exemple.com"]);
    assert.equal(serveur.derniere.arguments.to, "nadia.morel@exemple.com");
    assert.equal(serveur.derniere.arguments.subject, "Sujet");
  });

  test("--json - lit l'entrée standard", async () => {
    const { code } = await lancer(["get_thread", "--json", "-"], {
      entree: JSON.stringify({ thread_id: "thr_0e5a7c2b9f1d48e6a3c7b5d0e2f9a814" }),
    });
    assert.equal(code, 0);
    assert.equal(serveur.derniere.arguments.thread_id, "thr_0e5a7c2b9f1d48e6a3c7b5d0e2f9a814");
  });

  test("la clé d'idempotence part en en-tête", async () => {
    const args = ["send_email", ...ENVOI, "--idempotency-key", "rdv-jeudi-nadia-morel"];
    const premier = JSON.parse((await lancer(args)).sortie);
    const second = JSON.parse((await lancer(args)).sortie);
    assert.equal(serveur.derniere.entetes["idempotency-key"], "rdv-jeudi-nadia-morel");
    assert.equal(premier.replayed, false);
    assert.equal(second.replayed, true);
  });

  test("--dry-run affiche la requête sans l'envoyer, clé masquée", async () => {
    const { code, sortie } = await lancer(["send_email", ...ENVOI, "--dry-run"]);
    assert.equal(code, 0);
    const requete = JSON.parse(sortie);
    assert.equal(requete.url, `${serveur.url}/v1/send_email`);
    assert.equal(requete.headers.Authorization, "Bearer sak_…");
    assert.equal(requete.body.to, "nadia.morel@exemple.com");
    assert.ok(!sortie.includes(CLE_AGENT));
    assert.equal(serveur.connexions, 0);
  });
});

describe("clé", () => {
  test("sans clé, l'inscription passe, et la clé rendue n'est pas répétée", async () => {
    const { code, sortie, erreur } = await lancer(["sign_up", "--username", "atelier-exemple", "--human_email", "marie@exemple.fr"], { cle: "" });
    assert.equal(code, 0);
    assert.equal(serveur.derniere.entetes.authorization, undefined);
    assert.equal(JSON.parse(sortie).api_key, CLE_AGENT);
    assert.match(erreur, /ne s'affiche qu'une fois/);
    assert.ok(!erreur.includes(CLE_AGENT));
  });

  test("la clé se lit dans le fichier .env du dossier courant", async () => {
    const dossier = mkdtempSync(join(tmpdir(), "subagent-cli-"));
    try {
      writeFileSync(join(dossier, ".env"), `# clé d'exemple\nSUBAGENT_KEY="${CLE_HUMAIN}"\n`);
      const { code } = await lancer(["approve_message", "--message_id", MESSAGE], { cle: "", cwd: dossier });
      assert.equal(code, 0);
      assert.equal(serveur.derniere.entetes.authorization, `Bearer ${CLE_HUMAIN}`);
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });
});

describe("refus et erreurs", () => {
  test("un refus sort en JSON sur la sortie d'erreur, code de sortie 1", async () => {
    const { code, sortie, erreur } = await lancer(["send_email", ...ENVOI.slice(0, 2), "--to", DESTINATAIRE_BLOQUE, ...ENVOI.slice(4)]);
    assert.equal(code, 1);
    assert.equal(sortie, "");
    const refus = JSON.parse(erreur).error;
    assert.equal(refus.code, "recipient_suppressed");
    assert.ok(refus.message.includes(DESTINATAIRE_BLOQUE));
    assert.ok(refus.hint);
  });

  test("un agent ne valide pas son brouillon", async () => {
    const { code, erreur } = await lancer(["approve_message", "--message_id", MESSAGE]);
    assert.equal(code, 1);
    assert.equal(JSON.parse(erreur).error.code, "forbidden");
  });

  test("sans clé : le refus du serveur dit quoi faire", async () => {
    const { code, erreur } = await lancer(["inbox_status"], { cle: "" });
    assert.equal(code, 1);
    const refus = JSON.parse(erreur).error;
    assert.equal(refus.code, "unauthorized");
    assert.match(refus.hint, /sign_up/);
  });

  test("opération inconnue : code de sortie 2, rien n'est envoyé", async () => {
    const { code, erreur } = await lancer(["envoyer_un_fax"]);
    assert.equal(code, 2);
    assert.match(erreur, /Opération inconnue : envoyer_un_fax/);
    assert.equal(serveur.connexions, 0);
  });

  test("paramètre inconnu : code de sortie 2, la liste des paramètres", async () => {
    const { code, erreur } = await lancer(["send_email", ...ENVOI, "--thread_id", "thr_0e5a7c2b9f1d48e6a3c7b5d0e2f9a814"]);
    assert.equal(code, 2);
    assert.match(erreur, /Paramètre inconnu pour send_email : --thread_id/);
    assert.match(erreur, /--inbox_id/);
    assert.equal(serveur.connexions, 0);
  });

  test("valeur mal formée : code de sortie 2", async () => {
    assert.equal((await lancer(["list_threads", "--limit", "beaucoup"])).code, 2);
    assert.equal((await lancer(["send_email", ...ENVOI, "--metadata", "pas du json"])).code, 2);
    assert.equal((await lancer(["send_email", "--inbox_id"])).code, 2);
    assert.equal(serveur.connexions, 0);
  });

  test("un argument obligatoire manque : c'est le serveur qui le dit", async () => {
    const { code, erreur } = await lancer(["send_email", "--inbox_id", BOITE]);
    assert.equal(code, 1);
    assert.equal(JSON.parse(erreur).error.code, "invalid_argument");
  });

  test("serveur injoignable : code de sortie 3", async () => {
    const { code, erreur } = await lancer(["inbox_status", "--base-url", "http://127.0.0.1:9"]);
    assert.equal(code, 3);
    assert.match(erreur, /Pas de réponse/);
  });

  test("réponse d'un mandataire : code de sortie 3", async () => {
    serveur.passerelles = 1;
    const { code, erreur } = await lancer(["inbox_status"]);
    assert.equal(code, 3);
    assert.match(erreur, /HTTP 502/);
  });
});
