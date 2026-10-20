#!/usr/bin/env node
// La ligne de commande de Subagent Mail : une commande par opération du serveur.
//
//     subagent <opération> [--paramètre valeur …]
//
// Aucune dépendance. Les opérations et leurs paramètres viennent de lib/operations.json, généré
// depuis le registre d'opérations du serveur : ce fichier ne connaît aucune opération par son nom.

import { existsSync, readFileSync } from "node:fs";

const CATALOGUE = JSON.parse(readFileSync(new URL("../lib/operations.json", import.meta.url), "utf8"));
const OPERATIONS = new Map(CATALOGUE.operations.map((operation) => [operation.nom, operation]));
const SORTIE = { ok: 0, refus: 1, usage: 2, reseau: 3 };

class Usage extends Error {}

/** `.env` du dossier courant : SUBAGENT_KEY et SUBAGENT_BASE_URL, s'ils ne sont pas déjà définis. */
function lireEnv() {
  if (!existsSync(".env")) return;
  for (const ligne of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?(SUBAGENT_KEY|SUBAGENT_BASE_URL)\s*=\s*(.*?)\s*$/.exec(ligne);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}

function acces(operation) {
  return operation.sans_cle ? "sans clé" : `permission ${operation.permissions.join(" ou ")}`;
}

function aideGenerale() {
  const lignes = [
    `subagent ${CATALOGUE.version} : la ligne de commande de Subagent Mail`,
    "",
    "Usage",
    "  subagent <opération> [--paramètre valeur …]",
    "  subagent <opération> --help          les paramètres d'une opération",
    "  subagent <opération> --json '{…}'    les arguments en JSON (« - » : lus sur l'entrée standard)",
    "  subagent <opération> … --dry-run     affiche la requête sans l'envoyer",
    "",
    "Clé : variable SUBAGENT_KEY (ou fichier .env du dossier courant). Pas encore de clé :",
    `  subagent ${CATALOGUE.publique} --help`,
    "",
    "Opérations",
  ];
  for (const famille of CATALOGUE.familles) {
    lignes.push(`  ${famille.titre}`);
    for (const nom of famille.operations) {
      lignes.push(`    ${nom.padEnd(20)} ${OPERATIONS.get(nom).titre}`);
    }
  }
  lignes.push(
    "",
    "Le résultat sort en JSON sur la sortie standard. Un refus du serveur sort en JSON sur la sortie",
    "d'erreur, avec son code, son message et sa piste (hint). Codes de sortie : 0 succès, 1 refus du",
    "serveur, 2 commande mal formée, 3 pas de réponse du serveur.",
    "",
    `Documentation : ${CATALOGUE.site}/docs`,
  );
  return lignes.join("\n");
}

function aideOperation(operation) {
  const lignes = [`subagent ${operation.nom} : ${operation.titre}`, "", ...plier(operation.description, 96), ""];
  lignes.push(`Accès : ${acces(operation)}.${operation.espace === "vérifié" ? " Espace vérifié." : ""}`, "");
  if (operation.parametres.length === 0) {
    lignes.push("Aucun paramètre.");
  } else {
    lignes.push("Paramètres");
    for (const p of operation.parametres) {
      const type = p.valeurs ? p.valeurs.join(" | ") : p.type;
      lignes.push(`  --${p.nom} <${type}>${p.obligatoire ? "  (obligatoire)" : ""}`);
      for (const ligne of plier(p.description, 88)) lignes.push(`      ${ligne}`);
    }
  }
  lignes.push("", "Exemple", `  ${operation.exemple}`);
  return lignes.join("\n");
}

function plier(texte, largeur) {
  const lignes = [];
  let ligne = "";
  for (const mot of texte.split(/\s+/)) {
    if (ligne && ligne.length + 1 + mot.length > largeur) {
      lignes.push(ligne);
      ligne = mot;
    } else {
      ligne = ligne ? `${ligne} ${mot}` : mot;
    }
  }
  if (ligne) lignes.push(ligne);
  return lignes;
}

async function entreeStandard() {
  const morceaux = [];
  for await (const morceau of process.stdin) morceaux.push(morceau);
  return Buffer.concat(morceaux).toString("utf8");
}

function objetJson(texte, origine) {
  let valeur;
  try {
    valeur = JSON.parse(texte);
  } catch {
    throw new Usage(`${origine} : JSON illisible.`);
  }
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) {
    throw new Usage(`${origine} : un objet JSON est attendu.`);
  }
  return valeur;
}

/** Une liste : des valeurs séparées par des virgules, ou un tableau JSON. */
function liste(texte, origine) {
  const brut = texte.trim();
  if (!brut.startsWith("[")) {
    return brut === "" ? [] : brut.split(",").map((valeur) => valeur.trim()).filter(Boolean);
  }
  let valeur;
  try {
    valeur = JSON.parse(brut);
  } catch {
    throw new Usage(`${origine} : JSON illisible.`);
  }
  if (!Array.isArray(valeur)) throw new Usage(`${origine} : une liste est attendue.`);
  return valeur;
}

/** La valeur d'un paramètre, telle que le serveur l'attend. */
function convertir(parametre, texte) {
  switch (parametre.type) {
    case "entier":
      if (!/^-?\d+$/.test(texte)) throw new Usage(`--${parametre.nom} attend un entier, reçu « ${texte} ».`);
      return Number(texte);
    case "booléen":
      if (texte === "true" || texte === "false") return texte === "true";
      throw new Usage(`--${parametre.nom} attend true ou false, reçu « ${texte} ».`);
    case "objet":
      return objetJson(texte, `--${parametre.nom}`);
    case "liste":
      return liste(texte, `--${parametre.nom}`);
    default:
      return texte;
  }
}

/** Lit la ligne de commande : l'opération, ses arguments, les options de la commande. */
async function lire(argv) {
  const options = {};
  if (argv.length === 0 || ["help", "--help", "-h"].includes(argv[0])) {
    if (argv[0] === "help" && argv[1]) return { operation: trouver(argv[1]), options: { help: true }, args: {} };
    return { options: { help: true } };
  }
  if (["--version", "-v", "version"].includes(argv[0])) return { options: { version: true } };
  const operation = trouver(argv[0]);
  const parNom = new Map(operation.parametres.map((p) => [p.nom, p]));
  const args = {};
  let base = {};
  for (let i = 1; i < argv.length; i++) {
    const mot = argv[i];
    if (mot === "-h") {
      options.help = true;
      continue;
    }
    if (!mot.startsWith("--")) throw new Usage(`Argument inattendu : « ${mot} ». Les paramètres s'écrivent --nom valeur.`);
    const egal = mot.indexOf("=");
    const nom = (egal < 0 ? mot.slice(2) : mot.slice(2, egal)).replaceAll("-", "_");
    let valeur = egal < 0 ? undefined : mot.slice(egal + 1);
    const suivant = () => {
      if (valeur !== undefined) return valeur;
      if (i + 1 >= argv.length) throw new Usage(`--${nom} attend une valeur.`);
      return argv[++i];
    };
    if (nom === "help" || nom === "dry_run") {
      options[nom] = true;
    } else if (nom === "base_url") {
      options.base_url = suivant();
    } else if (nom === "json") {
      const texte = suivant();
      base = objetJson(texte === "-" ? await entreeStandard() : texte, "--json");
    } else if (parNom.has(nom)) {
      const parametre = parNom.get(nom);
      if (parametre.type === "booléen" && valeur === undefined) {
        // --confirm vaut true ; --confirm false et --confirm=false valent false.
        const apres = argv[i + 1];
        valeur = apres === "true" || apres === "false" ? argv[++i] : "true";
      }
      args[nom] = convertir(parametre, suivant());
    } else {
      const connus = operation.parametres.map((p) => `--${p.nom}`).join(", ") || "aucun";
      throw new Usage(`Paramètre inconnu pour ${operation.nom} : --${nom}. Paramètres : ${connus}.`);
    }
  }
  return { operation, options, args: { ...base, ...args } };
}

function trouver(nom) {
  const operation = OPERATIONS.get(nom.replaceAll("-", "_"));
  if (!operation) throw new Usage(`Opération inconnue : ${nom}. Lancez « subagent » pour la liste.`);
  return operation;
}

function ecrire(flux, valeur) {
  flux.write(`${typeof valeur === "string" ? valeur : JSON.stringify(valeur, null, 2)}\n`);
}

async function principal(argv) {
  lireEnv();
  const { operation, options, args } = await lire(argv);
  if (options.version) {
    ecrire(process.stdout, CATALOGUE.version);
    return SORTIE.ok;
  }
  if (options.help) {
    ecrire(process.stdout, operation ? aideOperation(operation) : aideGenerale());
    return SORTIE.ok;
  }

  const cle = process.env.SUBAGENT_KEY || undefined;
  const base = (options.base_url || process.env.SUBAGENT_BASE_URL || CATALOGUE.api).replace(/\/+$/, "");
  const url = `${base}/v1/${operation.nom}`;
  const { idempotency_key: idempotence, ...corps } = args;
  const entetes = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": `subagent-mail-cli/${CATALOGUE.version}`,
  };
  if (cle) entetes.Authorization = `Bearer ${cle}`;
  if (operation.idempotence && idempotence !== undefined) entetes["Idempotency-Key"] = String(idempotence);
  else if (idempotence !== undefined) corps.idempotency_key = idempotence;

  if (options.dry_run) {
    const visibles = { ...entetes };
    if (cle) visibles.Authorization = "Bearer sak_…";
    ecrire(process.stdout, { method: "POST", url, headers: visibles, body: corps });
    return SORTIE.ok;
  }

  let reponse;
  let texte;
  try {
    reponse = await fetch(url, {
      method: "POST",
      headers: entetes,
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(30_000),
    });
    texte = await reponse.text();
  } catch (erreur) {
    const raison = erreur?.cause?.message || erreur?.message || String(erreur);
    ecrire(process.stderr, `Pas de réponse de ${base} (${raison}). Rien ne dit si l'appel a abouti.`);
    return SORTIE.reseau;
  }
  let valeur;
  try {
    valeur = JSON.parse(texte);
  } catch {
    valeur = undefined;
  }
  const refus = valeur?.error;
  if (!reponse.ok && refus && typeof refus.code === "string") {
    ecrire(process.stderr, { error: refus });
    return SORTIE.refus;
  }
  if (!reponse.ok || typeof valeur !== "object" || valeur === null) {
    ecrire(process.stderr, `Réponse inattendue du serveur (HTTP ${reponse.status}), sans corps d'erreur Subagent.`);
    return SORTIE.reseau;
  }
  ecrire(process.stdout, valeur);
  if (typeof valeur.api_key === "string") {
    ecrire(process.stderr, 'Cette clé ne s\'affiche qu\'une fois. Rangez-la : export SUBAGENT_KEY="sak_…"');
  }
  return SORTIE.ok;
}

try {
  process.exitCode = await principal(process.argv.slice(2));
} catch (erreur) {
  if (!(erreur instanceof Usage)) throw erreur;
  ecrire(process.stderr, erreur.message);
  process.exitCode = SORTIE.usage;
}
