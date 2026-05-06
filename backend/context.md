Contexte du projet
Je développe une extension Chrome pour transformer un article web en contenu lisable par une liseuse (Kindle, Kobo, etc) avec un backend Node.js déployé sur Railway et une base de données PostgreSQL. 
L'authentification est gérée en email/mot de passe (Google OAuth prévu plus tard mais pas maintenant). Le projet n'est pas encore publié sur le Chrome Web Store.

Objectif
Intégrer Stripe pour gérer des abonnements payants (mensuel et annuel), avec renouvellement automatique et résiliation en fin de période.