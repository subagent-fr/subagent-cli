# subagent-cli

La ligne de commande de **Subagent Mail** : des boîtes mail pour agents IA. Créer une boîte, écrire, lire un fil, valider un brouillon, depuis un terminal ou depuis un agent qui lance des commandes.

- **Une commande par opération du serveur** (64), mêmes noms et mêmes paramètres que les outils du MCP.
- **Aucune dépendance**, aucune compilation : Node 20 ou plus.
- **Faite pour être lue par un agent** : résultat en JSON, refus en JSON avec leur piste, codes de sortie stables.
- **Générée** depuis le registre d'opérations du serveur, jamais écrite à la main.

## Installer

```sh
npm install -g github:subagent-fr/subagent-cli
```

Ou sans rien installer :

```sh
npx github:subagent-fr/subagent-cli inbox_status
```

La commande s'appelle `subagent`.

## Démarrer

### 1. Une clé

Sans clé, une seule opération est ouverte : `sign_up`. Elle rend une clé, affichée une seule fois, et une boîte sur `subagentmail.fr`. Votre humain reçoit un code à 6 chiffres par e-mail ; `verify` ouvre l'envoi.

```sh
subagent sign_up --username atelier-exemple --human_email marie@exemple.fr
export SUBAGENT_KEY="sak_…"   # la clé rendue : rangez-la
subagent verify --otp_code 482913
```

La clé se lit dans la variable `SUBAGENT_KEY`, ou dans un fichier `.env` du dossier courant. Elle ne se passe jamais en argument : elle resterait dans l'historique du terminal.

### 2. Où en est la boîte

```sh
subagent inbox_status
```

`inbox_status` est le point de départ de toute session : l'espace, les permissions de la clé, le créneau d'envoi, et pour chaque boîte son quota du jour.

### 3. Un premier envoi

Un envoi de test ne part qu'à l'humain de l'espace ou à une autre de ses boîtes : remplacez l'adresse par la vôtre, et l'identifiant par celui de votre boîte.

```sh
subagent send_email \
  --inbox_id inb_3f9c2a7e5b1d4c8e9a0f6b2d7c4e1a95 \
  --to marie@exemple.fr \
  --subject 'Premier message' \
  --text 'Bonjour Marie, ceci est mon premier message.' \
  --test --requires_approval \
  --idempotency_key premier-message-1
```

Avec `--requires_approval`, le message reste en brouillon jusqu'à la validation d'un humain. Sans lui, il entre en file et part dans le créneau d'envoi, selon le quota du jour de la boîte : la réponse donne l'heure de départ au plus tôt. Un message en file n'est pas une erreur : ne le renvoyez pas.

## Usage

```sh
subagent <opération> [--paramètre valeur …]
subagent <opération> --help
subagent                          # la liste des opérations
```

| Famille | Commandes |
| --- | --- |
| Inscription | `sign_up`, `verify`, `attach_human` |
| Boîtes | `inbox_status`, `activity_report`, `list_inboxes`, `create_inbox`, `update_inbox`, `delete_inbox`, `request_inbox_review` |
| Domaines | `inspect_domain`, `add_domain`, `verify_domain`, `list_domains`, `domain_quality`, `remove_domain` |
| Envoi | `send_email`, `reply_to_thread` |
| Fils | `list_threads`, `get_thread`, `classify_thread`, `close_thread`, `get_message` |
| Brouillons | `list_drafts`, `update_draft`, `approve_message`, `cancel_message` |
| Pièces jointes | `attach_files`, `remove_attachment`, `get_attachment` |
| Liste de blocage | `add_suppression`, `remove_suppression`, `list_suppressions` |
| Contacts et audiences | `list_contacts`, `get_contact`, `save_contact`, `set_contact_audiences`, `list_audiences`, `get_audience`, `save_audience`, `import_contacts`, `remove_audience_contact` |
| Campagnes | `list_campaigns`, `get_campaign`, `save_campaign`, `preview_campaign`, `campaign_action`, `campaign_metrics`, `campaign_history`, `list_campaign_templates`, `save_campaign_template` |
| Main courante | `list_events`, `workspace_snapshot` |
| Forfait | `billing_status`, `subscribe`, `cancel_subscription` |
| Espace et accès | `get_settings`, `update_settings`, `list_keys`, `create_key`, `revoke_key`, `set_webhook`, `remove_webhook`, `close_space` |

Paramètres, résultat et un exemple par commande : [`reference.md`](reference.md), ou `subagent <opération> --help`.

- Un paramètre s'écrit `--nom valeur` ou `--nom=valeur` ; tirets et soulignés se valent (`--inbox-id`, `--inbox_id`).
- Un booléen sans valeur vaut vrai : `--confirm`. Pour faux : `--test false`.
- Une liste se donne séparée par des virgules, ou en JSON : `--permissions send,read`.
- `--json '{…}'` donne tous les arguments d'un coup ; `--json -` les lit sur l'entrée standard. Un paramètre nommé l'emporte.
- `--dry-run` affiche la requête sans l'envoyer, clé masquée.
- `--base-url` (ou la variable `SUBAGENT_BASE_URL`) vise une autre adresse que `https://api.subagent.fr`.

## Sortie

Le résultat sort en JSON sur la sortie standard : il se passe tel quel à `jq` ou à un agent.

Un refus du serveur n'est pas une panne. Il sort en JSON sur la sortie d'erreur, avec un `code` stable, un `message` en français et une piste (`hint`) qui dit quoi faire. La piste se suit, elle ne se contourne pas.

```sh
subagent approve_message --message_id msg_7f2a91c4e8b34d0fa6c25e1b9d3f7a48
```

```json
{
  "error": {
    "code": "forbidden",
    "message": "approve_message demande la permission approve, que cette clé n’a pas.",
    "hint": "La validation est un geste humain : un humain l’accomplit depuis son assistant, avec une clé qui porte approve."
  }
}
```

Un agent ne valide jamais son propre brouillon : `approve_message` demande la permission `approve`, que la clé rendue par `sign_up` ne porte pas.

| Code de sortie | Sens |
| --- | --- |
| 0 | Succès. |
| 1 | Refus du serveur : le JSON du refus est sur la sortie d'erreur. |
| 2 | Commande mal formée : opération ou paramètre inconnu, valeur illisible. Rien n'a été envoyé. |
| 3 | Pas de réponse du serveur. Rien ne dit si l'appel a abouti. |

Tous les codes de refus : [`reference.md`](reference.md#erreurs).

## Idempotence

Passez `--idempotency_key` à chaque envoi qu'un agent pourrait rejouer : elle part dans l'en-tête `Idempotency-Key`. Même clé, même contenu : le message déjà créé, avec `replayed` à vrai. Même clé, autre contenu : refus `idempotency_conflict`.

La commande ne réessaie jamais seule. Après un code de sortie 3, relancez la même commande avec la même `--idempotency_key`.

## Tests

Les tests lancent la commande pour de vrai contre un faux serveur local, généré depuis le même registre : il contrôle la clé, les permissions et chaque argument contre le schéma, et n'envoie rien.

```sh
npm test
```

## Contribuer

Ce dépôt est généré depuis le registre d'opérations du serveur : une modification faite ici à la main serait écrasée à la génération suivante. Ouvrez un ticket plutôt qu'une demande de fusion.

## Licence

MIT. Le serveur Subagent, lui, n'est pas ouvert : ces clients ne servent qu'avec une clé Subagent.
