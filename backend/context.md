Contexte du projet
Je développe une extension Chrome pour transformer un article web en contenu lisable par une liseuse (Kindle, Kobo, etc) avec un backend Node.js déployé sur Railway et une base de données PostgreSQL. 
L'authentification est gérée en email/mot de passe (Google OAuth prévu plus tard mais pas maintenant). Le projet n'est pas encore publié sur le Chrome Web Store.

Objectif
Intégrer l'inscription ou connexion automatique via Google OAuth pour éviter aux utilisateurs de devoir rentrer leur email et mot de passe à chaque fois.
Il ne faut pas créer de doublons dans la base de données, un utilisateur peut se connecter via Google ou via email et faire les mêmes actions avec l'un ou l'autre méthode.