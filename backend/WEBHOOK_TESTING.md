# Test des webhooks Stripe en local

## Prérequis

- [Stripe CLI](https://stripe.com/docs/stripe-cli) installé (`brew install stripe/stripe-cli/stripe`)
- Authentifié : `stripe login`
- Serveur local démarré : `npm run dev`

---

## 1. Lancer l'écoute et le forwarding

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Le CLI affiche un `whsec_xxx...` — copie-le dans ton `.env` :

```
STRIPE_WEBHOOK_SECRET=whsec_xxx...
```

Redémarre le serveur après avoir mis à jour `.env`.

---

## 2. Déclencher chaque événement

### `checkout.session.completed`

```bash
stripe trigger checkout.session.completed
```

**Ce qui doit se passer :**
- La subscription Stripe est récupérée pour extraire `price_id`, `current_period_end`
- L'utilisateur dont `stripe_customer_id` correspond est mis à jour

**Résultat attendu en base :**
```sql
SELECT stripe_subscription_id, plan, billing, subscription_status,
       current_period_end, subscribed_at, trial_used, trial_end
FROM users WHERE stripe_customer_id = 'cus_xxx';
```
| Colonne | Valeur attendue |
|---|---|
| `plan` | `pro` |
| `billing` | `monthly` ou `annual` (selon le price_id) |
| `subscription_status` | `active` |
| `stripe_subscription_id` | `sub_xxx` (renseigné) |
| `current_period_end` | date future |
| `subscribed_at` | date de souscription (non null) |
| `trial_used` | `true` |
| `trial_end` | `NULL` |

---

### `invoice.paid`

```bash
stripe trigger invoice.paid
```

**Ce qui doit se passer :**
- Renouvellement mensuel/annuel confirmé
- `subscription_status` passe (ou reste) à `active`
- `current_period_end` est mis à jour vers la prochaine période

**Résultat attendu en base :**
```sql
SELECT subscription_status, current_period_end
FROM users WHERE stripe_customer_id = 'cus_xxx';
```
| Colonne | Valeur attendue |
|---|---|
| `subscription_status` | `active` |
| `current_period_end` | date future mise à jour |

---

### `invoice.payment_failed`

```bash
stripe trigger invoice.payment_failed
```

**Ce qui doit se passer :**
- Le prélèvement a échoué (carte expirée, fonds insuffisants…)
- L'utilisateur reste Pro mais est marqué en retard de paiement

**Résultat attendu en base :**
```sql
SELECT subscription_status FROM users WHERE stripe_customer_id = 'cus_xxx';
```
| Colonne | Valeur attendue |
|---|---|
| `subscription_status` | `past_due` |

---

### `customer.subscription.updated`

```bash
stripe trigger customer.subscription.updated
```

**Ce qui doit se passer :**
- Changement de plan (monthly ↔ annual), activation d'annulation en fin de période, etc.
- Toutes les colonnes d'abonnement sont resynchronisées depuis Stripe

**Résultat attendu en base :**
```sql
SELECT plan, billing, subscription_status, current_period_end, cancel_at_period_end
FROM users WHERE stripe_customer_id = 'cus_xxx';
```
| Colonne | Valeur attendue |
|---|---|
| `plan` | `pro` si `status` = `active` ou `trialing`, sinon `free` |
| `billing` | `monthly` ou `annual` |
| `subscription_status` | statut Stripe (`active`, `trialing`, `past_due`…) |
| `cancel_at_period_end` | `true` si annulation planifiée, sinon `false` |

---

### `customer.subscription.deleted`

```bash
stripe trigger customer.subscription.deleted
```

**Ce qui doit se passer :**
- L'abonnement est résilié définitivement (fin de période ou immédiatement)
- L'utilisateur repasse en `free`

**Résultat attendu en base :**
```sql
SELECT plan, billing, subscription_status, stripe_subscription_id, cancel_at_period_end
FROM users WHERE stripe_customer_id = 'cus_xxx';
```
| Colonne | Valeur attendue |
|---|---|
| `plan` | `free` |
| `billing` | `NULL` |
| `subscription_status` | `canceled` |
| `stripe_subscription_id` | `NULL` |
| `cancel_at_period_end` | `false` |

---

## 3. Vérifier en base (Railway)

```bash
# Via Railway CLI
railway run psql $DATABASE_URL -c \
  "SELECT id, email, plan, subscription_status, billing, current_period_end, cancel_at_period_end, trial_used FROM users LIMIT 10;"
```

Ou directement :

```bash
psql $DATABASE_URL -c "SELECT email, plan, subscription_status FROM users;"
```

---

## 4. Vérifier les logs du serveur

Chaque webhook loggue une ligne dans la console du serveur :
- `✅ Webhook checkout.session.completed — customer: cus_xxx`
- `✅ Webhook invoice.paid — customer: cus_xxx`
- `⚠️ Webhook invoice.payment_failed — customer: cus_xxx`
- `✅ Webhook customer.subscription.updated — customer: cus_xxx, status: active`
- `✅ Webhook customer.subscription.deleted — customer: cus_xxx`

Une erreur de signature (`400 Signature invalide`) indique que `STRIPE_WEBHOOK_SECRET` ne correspond pas au secret affiché par `stripe listen`.
