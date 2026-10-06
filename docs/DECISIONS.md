# Décisions techniques

Choix faits en construisant Karaks Storage, avec leur raison. Les sections
du cahier des charges sont citées « CDS n ».

| # | Sujet | Décision | Raison |
|---|---|---|---|
| 1 | Dépôt | Projet Git séparé de Karaks | Produit indépendant, destiné aussi à Moziik (CDS 41). |
| 2 | Identité | Palette propre (marine, accent bleu), Poppins pour les titres, Inter pour l'interface | Continuité avec Karaks sans en reprendre l'identité. |
| 3 | Accès à Drive | API REST v3 en direct, sans le SDK `googleapis` | Cinq appels utiles ; le SDK pèse des dizaines de Mo et masque les plages et l'envoi reprenable. |
| 4 | Droit Google | `drive.file` uniquement | Pas d'audit de sécurité Google ; l'application ne voit que ses propres fichiers. |
| 5 | Jeton Google | Obtenu par le bouton des réglages, chiffré en base ; `GOOGLE_REFRESH_TOKEN` reste possible | Évite de manipuler le jeton à la main (CDS 30). |
| 6 | Compte de service | Écarté | Un compte de service n'a pas de quota sur un Drive personnel : il faudrait Google Workspace. |
| 7 | Diffusion | Les octets passent par le serveur | Les liens Drive ne doivent jamais être exposés (CDS 1, 24). D'où un serveur Node permanent. |
| 8 | Envoi | Toujours reprenable dans le tableau de bord ; envoi simple jusqu'à 100 Mo pour l'API | Un seul chemin à maintenir ; la reprise sert aussi aux fichiers moyens sur mobile. |
| 9 | Liens temporaires | Jeton de 24 caractères en base 62, empreinte HMAC en base | Une fuite de la base ne donne aucun lien utilisable (CDS 15). |
| 10 | Usage unique et plages | Un usage est compté à l'ouverture (octet 0) ; les plages suivantes sont admises 6 h après | Un lecteur demande un titre en plusieurs morceaux : sans cela, un lien à usage unique s'arrêterait au deuxième. |
| 11 | Forme d'onde | Calculée par le navigateur au téléversement, stockée avec le fichier | Affichage sans relire le fichier chez Drive, donc sans bande passante ni lecture fantôme dans les statistiques. |
| 12 | Statistiques | Compteurs agrégés en mémoire, écrits par lot toutes les 5 s | Une écriture en base par requête doublerait la charge pour une statistique. Le journal d'audit, lui, est écrit tout de suite. |
| 13 | Lectures comptées | À l'ouverture seulement | Des dizaines de requêtes de plage par écoute gonfleraient les chiffres. |
| 14 | Premier administrateur | `npm run admin:create` en console | Faire du premier inscrit un administrateur donnerait le service à qui s'inscrit le premier après la mise en ligne. |
| 15 | Création de projets | Réservée aux administrateurs (CDS 39) | Le stockage est le compte Google du propriétaire : un inconnu ne doit pas pouvoir le remplir. |
| 16 | Notifications | Tirées du journal, avec une date « vu jusqu'ici » par compte | Le journal porte déjà tout ; pas de table en double. |
| 17 | Limitation de débit | En mémoire, par clé ou compte et par projet | Suffisant sur une instance ; Redis (CDS 30) quand il y en aura plusieurs. |
| 18 | Webhooks | Signature `t=<horodatage>,v1=<HMAC>`, adresses internes refusées en production | Authenticité, pas de rejeu, pas de SSRF vers le réseau du serveur. |

## Points ouverts

- **Hébergement** : un serveur Node permanent est nécessaire (décision 7).
  Railway convient ; à choisir.
- **Bande passante** : chaque écoute passe deux fois par le réseau du serveur
  (Drive vers serveur, serveur vers auditeur). À surveiller dans Analytics
  avant d'ouvrir Karaks à un large public.
- **Quotas Google** : Drive limite le nombre de requêtes par minute et le
  volume téléchargé par jour. Le passage à R2 ou S3 (CDS 38) lèvera ces
  limites sans changer l'API.
- **Plusieurs instances** : limitation de débit partagée à brancher (Redis).
