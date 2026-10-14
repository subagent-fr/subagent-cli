// Chaque opération du registre, lancée par la commande, contre le faux serveur.
//
// Généré depuis le registre d'opérations du serveur (clients/generer.py) : ne le modifiez pas.

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import { CLE_HUMAIN, FauxServeur, OPERATIONS } from "./faux-serveur.mjs";

const COMMANDE = fileURLToPath(new URL("../bin/subagent.mjs", import.meta.url));

describe("chaque opération du registre (64)", () => {
  let serveur;
  before(async () => {
    serveur = await new FauxServeur().demarrer();
  });
  after(() => serveur.arreter());

  /** Lance `subagent <nom> …` avec tous les arguments d'exemple, et contrôle ce que le serveur a reçu. */
  function controler(nom, mots) {
    const operation = OPERATIONS[nom];
    serveur.verifie = operation.espace !== "non vérifié";
    const env = { ...process.env, SUBAGENT_BASE_URL: serveur.url, SUBAGENT_KEY: CLE_HUMAIN };
    return new Promise((resolve, reject) => {
      execFile(process.execPath, [COMMANDE, nom, ...mots], { env }, (echec, sortie, erreur) => {
        try {
          assert.equal(echec, null, erreur);
          assert.equal(serveur.derniere.operation, nom);
          assert.deepEqual(serveur.derniere.arguments, operation.arguments);
          assert.deepEqual(Object.keys(JSON.parse(sortie)).sort(), Object.keys(operation.exemple).sort());
          assert.equal(serveur.derniere.entetes["idempotency-key"], operation.arguments.idempotency_key);
          resolve();
        } catch (ecart) {
          reject(ecart);
        }
      });
    });
  }

  test("sign_up", () =>
    controler("sign_up", [
      "--username",
      "atelier-exemple",
      "--human_email",
      "marie@exemple.fr",
      "--agent_name",
      "Atelier Exemple",
    ]));

  test("verify", () =>
    controler("verify", [
      "--otp_code",
      "482913",
    ]));

  test("attach_human", () =>
    controler("attach_human", [
      "--human_email",
      "marie@exemple.fr",
    ]));

  test("inbox_status", () =>
    controler("inbox_status", [
      "--inbox_id",
      "inb_3f9c2a7e5b1d4c8e9a0f6b2d7c4e1a95",
    ]));

  test("workspace_snapshot", () =>
    controler("workspace_snapshot", [
      "--known_revision",
      "r-2026-10-14-1",
    ]));

  test("activity_report", () =>
    controler("activity_report", [
      "--period",
      "week",
      "--inbox_id",
      "inb_3f9c2a7e5b1d4c8e9a0f6b2d7c4e1a95",
    ]));

  test("list_events", () =>
    controler("list_events", [
      "--day",
      "2026-10-14",
      "--inbox_id",
      "inb_3f9c2a7e5b1d4c8e9a0f6b2d7c4e1a95",
      "--thread_id",
      "thr_0e5a7c2b9f1d48e6a3c7b5d0e2f9a814",
      "--message_id",
      "msg_7f2a91c4e8b34d0fa6c25e1b9d3f7a48",
      "--campaign_id",
      "cmp_6b2d9e41c7a84f03b5e1d28a90c4f7e3",
      "--audience_id",
      "aud_3c8f1a5e9d2b47c6a0e4f81b7d5c9e26",
      "--contact",
      "nadia.morel@exemple.com",
      "--domain",
      "agents.exemple.fr",
      "--cursor",
      "eyJhIjoiMjAyNi0xMC0xMyJ9",
      "--limit",
      "20",
    ]));

  test("billing_status", () =>
    controler("billing_status", [
    ]));

  test("subscribe", () =>
    controler("subscribe", [
      "--plan",
      "mail-19",
    ]));

  test("cancel_subscription", () =>
    controler("cancel_subscription", [
    ]));

  test("list_inboxes", () =>
    controler("list_inboxes", [
      "--cursor",
      "eyJhIjoiMjAyNi0xMC0xMyJ9",
      "--limit",
      "20",
    ]));

  test("create_inbox", () =>
    controler("create_inbox", [
      "--username",
      "atelier-exemple",
      "--display_name",
      "Marie d’Atelier Exemple",
      "--domain",
      "agents.exemple.fr",
    ]));

  test("update_inbox", () =>
    controler("update_inbox", [
      "--inbox_id",
      "inb_3f9c2a7e5b1d4c8e9a0f6b2d7c4e1a95",
      "--display_name",
      "Marie d’Atelier Exemple",
    ]));

  test("delete_inbox", () =>
    controler("delete_inbox", [
      "--inbox_id",
      "inb_3f9c2a7e5b1d4c8e9a0f6b2d7c4e1a95",
      "--confirm",
    ]));

  test("request_inbox_review", () =>
    controler("request_inbox_review", [
      "--inbox_id",
      "inb_3f9c2a7e5b1d4c8e9a0f6b2d7c4e1a95",
      "--note",
      "A demandé à ne plus être contactée.",
    ]));

  test("add_domain", () =>
    controler("add_domain", [
      "--domain",
      "agents.exemple.fr",
    ]));

  test("verify_domain", () =>
    controler("verify_domain", [
      "--domain",
      "agents.exemple.fr",
    ]));

  test("list_domains", () =>
    controler("list_domains", [
    ]));

  test("domain_quality", () =>
    controler("domain_quality", [
      "--domain",
      "agents.exemple.fr",
      "--days",
      "30",
    ]));

  test("remove_domain", () =>
    controler("remove_domain", [
      "--domain",
      "agents.exemple.fr",
      "--confirm",
    ]));

  test("send_email", () =>
    controler("send_email", [
      "--inbox_id",
      "inb_3f9c2a7e5b1d4c8e9a0f6b2d7c4e1a95",
      "--to",
      "nadia.morel@exemple.com",
      "--subject",
      "Rendez-vous de jeudi",
      "--text",
      "Bonjour Madame Morel,\n\nPouvons-nous déplacer notre rendez-vous de jeudi à vendredi, 10 h ?\n\nBien à vous,\nMarie",
      "--to_name",
      "Nadia Morel",
      "--test=false",
      "--from_address",
      "marie@exemple.fr",
      "--html",
      "<p>Bonjour Madame Morel,</p><p>Pouvons-nous déplacer notre rendez-vous de jeudi à vendredi, 10 h ?</p><p>Bien à vous,<br>Marie</p>",
      "--reply_to",
      "marie@exemple.fr",
      "--metadata",
      "{\"dossier\": \"rdv-jeudi\"}",
      "--requires_approval",
      "--send_after",
      "2026-10-13T09:00:00+02:00",
      "--idempotency_key",
      "rdv-jeudi-nadia-morel",
    ]));

  test("list_threads", () =>
    controler("list_threads", [
      "--inbox_id",
      "inb_3f9c2a7e5b1d4c8e9a0f6b2d7c4e1a95",
      "--status",
      "replied",
      "--unanswered",
      "--archived=false",
      "--unread",
      "--label",
      "devis",
      "--folder",
      "received",
      "--since",
      "2026-10-12T00:00:00+02:00",
      "--query",
      "exemple.com",
      "--cursor",
      "eyJhIjoiMjAyNi0xMC0xMyJ9",
      "--limit",
      "20",
    ]));

  test("classify_thread", () =>
    controler("classify_thread", [
      "--thread_id",
      "thr_0e5a7c2b9f1d48e6a3c7b5d0e2f9a814",
      "--labels",
      "[\"devis\"]",
      "--archived=false",
      "--read",
    ]));

  test("inspect_domain", () =>
    controler("inspect_domain", [
      "--domain",
      "agents.exemple.fr",
    ]));

  test("list_contacts", () =>
    controler("list_contacts", [
      "--query",
      "exemple.com",
      "--label",
      "devis",
      "--audience_id",
      "aud_3c8f1a5e9d2b47c6a0e4f81b7d5c9e26",
      "--subscription",
      "subscribed",
      "--offset",
      "0",
      "--limit",
      "20",
    ]));

  test("get_contact", () =>
    controler("get_contact", [
      "--email",
      "nadia.morel@exemple.com",
    ]));

  test("save_contact", () =>
    controler("save_contact", [
      "--email",
      "nadia.morel@exemple.com",
      "--name",
      "Atelier Exemple",
      "--fields",
      "{\"prenom\": \"Nadia\", \"societe\": \"Atelier Morel\"}",
      "--labels",
      "[\"devis\"]",
    ]));

  test("set_contact_audiences", () =>
    controler("set_contact_audiences", [
      "--email",
      "nadia.morel@exemple.com",
      "--audience_ids",
      "[\"aud_3c8f1a5e9d2b47c6a0e4f81b7d5c9e26\"]",
    ]));

  test("list_audiences", () =>
    controler("list_audiences", [
    ]));

  test("list_campaign_templates", () =>
    controler("list_campaign_templates", [
    ]));

  test("save_campaign_template", () =>
    controler("save_campaign_template", [
      "--name",
      "Atelier Exemple",
      "--subject",
      "Rendez-vous de jeudi",
      "--text",
      "Bonjour Madame Morel,\n\nPouvons-nous déplacer notre rendez-vous de jeudi à vendredi, 10 h ?\n\nBien à vous,\nMarie",
      "--template_id",
      "5d1c8e2a-7b3f-4e9a-b0c6-2f4d8a1e9c37",
      "--html",
      "<p>Bonjour Madame Morel,</p><p>Pouvons-nous déplacer notre rendez-vous de jeudi à vendredi, 10 h ?</p><p>Bien à vous,<br>Marie</p>",
    ]));

  test("save_audience", () =>
    controler("save_audience", [
      "--name",
      "Atelier Exemple",
      "--audience_id",
      "aud_3c8f1a5e9d2b47c6a0e4f81b7d5c9e26",
    ]));

  test("get_audience", () =>
    controler("get_audience", [
      "--audience_id",
      "aud_3c8f1a5e9d2b47c6a0e4f81b7d5c9e26",
      "--offset",
      "0",
    ]));

  test("import_contacts", () =>
    controler("import_contacts", [
      "--audience_id",
      "aud_3c8f1a5e9d2b47c6a0e4f81b7d5c9e26",
      "--contacts",
      "[{\"email\": \"marc.lefevre@exemple.com\", \"name\": \"Marc Lefèvre\", \"fields\": {\"prenom\": \"Marc\"}}]",
    ]));

  test("remove_audience_contact", () =>
    controler("remove_audience_contact", [
      "--audience_id",
      "aud_3c8f1a5e9d2b47c6a0e4f81b7d5c9e26",
      "--email",
      "nadia.morel@exemple.com",
    ]));

  test("list_campaigns", () =>
    controler("list_campaigns", [
      "--offset",
      "0",
      "--archived=false",
    ]));

  test("save_campaign", () =>
    controler("save_campaign", [
      "--name",
      "Atelier Exemple",
      "--inbox_id",
      "inb_3f9c2a7e5b1d4c8e9a0f6b2d7c4e1a95",
      "--steps",
      "[{\"variants\": [{\"subject\": \"Vos chantiers de la rentrée\", \"text\": \"Bonjour {{prenom}},\\n\\nUn mot sur vos chantiers.\\n\\n{{unsubscribe_url}}\"}]}]",
      "--campaign_id",
      "cmp_6b2d9e41c7a84f03b5e1d28a90c4f7e3",
      "--from_address",
      "marie@exemple.fr",
      "--audience_id",
      "aud_3c8f1a5e9d2b47c6a0e4f81b7d5c9e26",
      "--reply_to",
      "marie@exemple.fr",
    ]));

  test("get_campaign", () =>
    controler("get_campaign", [
      "--campaign_id",
      "cmp_6b2d9e41c7a84f03b5e1d28a90c4f7e3",
      "--offset",
      "0",
    ]));

  test("preview_campaign", () =>
    controler("preview_campaign", [
      "--campaign_id",
      "cmp_6b2d9e41c7a84f03b5e1d28a90c4f7e3",
      "--offset",
      "0",
    ]));

  test("campaign_action", () =>
    controler("campaign_action", [
      "--campaign_id",
      "cmp_6b2d9e41c7a84f03b5e1d28a90c4f7e3",
      "--action",
      "pause",
      "--starts_at",
      "2026-10-20T09:00:00+02:00",
      "--confirm",
      "--revision",
      "5d41402abc4b2a76",
    ]));

  test("campaign_metrics", () =>
    controler("campaign_metrics", [
      "--campaign_id",
      "cmp_6b2d9e41c7a84f03b5e1d28a90c4f7e3",
      "--offset",
      "0",
    ]));

  test("campaign_history", () =>
    controler("campaign_history", [
      "--campaign_id",
      "cmp_6b2d9e41c7a84f03b5e1d28a90c4f7e3",
      "--offset",
      "0",
    ]));

  test("get_thread", () =>
    controler("get_thread", [
      "--thread_id",
      "thr_0e5a7c2b9f1d48e6a3c7b5d0e2f9a814",
      "--cursor",
      "eyJhIjoiMjAyNi0xMC0xMyJ9",
    ]));

  test("reply_to_thread", () =>
    controler("reply_to_thread", [
      "--thread_id",
      "thr_0e5a7c2b9f1d48e6a3c7b5d0e2f9a814",
      "--text",
      "Bonjour Madame Morel,\n\nPouvons-nous déplacer notre rendez-vous de jeudi à vendredi, 10 h ?\n\nBien à vous,\nMarie",
      "--subject",
      "Rendez-vous de jeudi",
      "--cc",
      "[\"bureau.etudes@exemple.com\"]",
      "--from_address",
      "marie@exemple.fr",
      "--html",
      "<p>Bonjour Madame Morel,</p><p>Pouvons-nous déplacer notre rendez-vous de jeudi à vendredi, 10 h ?</p><p>Bien à vous,<br>Marie</p>",
      "--reply_to",
      "marie@exemple.fr",
      "--metadata",
      "{\"dossier\": \"rdv-jeudi\"}",
      "--requires_approval",
      "--send_after",
      "2026-10-13T09:00:00+02:00",
      "--idempotency_key",
      "rdv-jeudi-nadia-morel",
    ]));

  test("close_thread", () =>
    controler("close_thread", [
      "--thread_id",
      "thr_0e5a7c2b9f1d48e6a3c7b5d0e2f9a814",
    ]));

  test("get_message", () =>
    controler("get_message", [
      "--message_id",
      "msg_7f2a91c4e8b34d0fa6c25e1b9d3f7a48",
    ]));

  test("list_drafts", () =>
    controler("list_drafts", [
      "--inbox_id",
      "inb_3f9c2a7e5b1d4c8e9a0f6b2d7c4e1a95",
      "--cursor",
      "eyJhIjoiMjAyNi0xMC0xMyJ9",
      "--limit",
      "20",
    ]));

  test("update_draft", () =>
    controler("update_draft", [
      "--message_id",
      "msg_7f2a91c4e8b34d0fa6c25e1b9d3f7a48",
      "--subject",
      "Rendez-vous de jeudi",
      "--text",
      "Bonjour Madame Morel,\n\nPouvons-nous déplacer notre rendez-vous de jeudi à vendredi, 10 h ?\n\nBien à vous,\nMarie",
      "--html",
      "<p>Bonjour Madame Morel,</p><p>Pouvons-nous déplacer notre rendez-vous de jeudi à vendredi, 10 h ?</p><p>Bien à vous,<br>Marie</p>",
    ]));

  test("approve_message", () =>
    controler("approve_message", [
      "--message_id",
      "msg_7f2a91c4e8b34d0fa6c25e1b9d3f7a48",
      "--revision",
      "5d41402abc4b2a76",
    ]));

  test("cancel_message", () =>
    controler("cancel_message", [
      "--message_id",
      "msg_7f2a91c4e8b34d0fa6c25e1b9d3f7a48",
      "--reason",
      "Rendez-vous annulé.",
    ]));

  test("attach_files", () =>
    controler("attach_files", [
      "--message_id",
      "msg_7f2a91c4e8b34d0fa6c25e1b9d3f7a48",
    ]));

  test("remove_attachment", () =>
    controler("remove_attachment", [
      "--attachment_id",
      "att_5e1c9a7b3d2f40618c4e6a0b9d7f2c35",
    ]));

  test("get_attachment", () =>
    controler("get_attachment", [
      "--attachment_id",
      "att_5e1c9a7b3d2f40618c4e6a0b9d7f2c35",
    ]));

  test("add_suppression", () =>
    controler("add_suppression", [
      "--address",
      "nadia.morel@exemple.com",
      "--note",
      "A demandé à ne plus être contactée.",
    ]));

  test("remove_suppression", () =>
    controler("remove_suppression", [
      "--address",
      "nadia.morel@exemple.com",
    ]));

  test("list_suppressions", () =>
    controler("list_suppressions", [
      "--query",
      "exemple.com",
      "--cursor",
      "eyJhIjoiMjAyNi0xMC0xMyJ9",
      "--limit",
      "20",
    ]));

  test("get_settings", () =>
    controler("get_settings", [
    ]));

  test("update_settings", () =>
    controler("update_settings", [
      "--name",
      "Atelier Exemple",
      "--postal_address",
      "12 rue des Lilas, 69007 Lyon",
      "--weekdays",
      "8-12,14-18",
      "--saturday",
      "9-12",
      "--sunday",
      "closed",
      "--skip_holidays",
      "--no_send_days",
      "[\"2026-12-24\"]",
      "--require_approval",
      "--spacing_minutes",
      "20",
      "--dedup_days",
      "60",
    ]));

  test("list_keys", () =>
    controler("list_keys", [
    ]));

  test("create_key", () =>
    controler("create_key", [
      "--name",
      "Atelier Exemple",
      "--permissions",
      "[\"send\", \"read\"]",
      "--inbox_ids",
      "[\"inb_3f9c2a7e5b1d4c8e9a0f6b2d7c4e1a95\"]",
      "--daily_cap",
      "50",
    ]));

  test("revoke_key", () =>
    controler("revoke_key", [
      "--key_id",
      "key_5a0d8e3c9b714f26a1e47c08b3d95f62",
      "--confirm",
    ]));

  test("set_webhook", () =>
    controler("set_webhook", [
      "--url",
      "https://exemple.fr/hooks/subagent",
    ]));

  test("remove_webhook", () =>
    controler("remove_webhook", [
    ]));

  test("close_space", () =>
    controler("close_space", [
      "--confirmation_code",
      "482913",
      "--cancel=false",
    ]));
});
