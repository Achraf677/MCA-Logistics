# 03b — Fiche d'une livraison (création / modification)

> Complète `03-livraisons.md`. Revue du 30/09/2026 : audit case par case, 12 scénarios réels
> joués sur la prod (35 courses, 31 clients), référentiel légal (arrêté 9/11/1999, contrat
> type général annexe II code des transports, L132-9 C. com., CMR, L3222-1, L441-11).
> Aucune ligne de code modifiée : à valider avant refonte.

## 1. Ce que montrent les vraies données
- 3 usages réels, aucun ne rentre bien dans la fiche :
  - sous-traitance express pour un commissionnaire (HOPHOP, 11/35) : la référence « ODT #… »
    est tapée dans la description, créneaux / contenu / destinataire dans les Notes, PDF de
    l'ordre joint ;
  - courses de plateformes (Cocolis…, ~12/35) : le message de la plateforme est collé dans
    les Notes (contacts, créneau, étage, « 2 personnes », montant) ; le client créé est le
    particulier alors que c'est la plateforme qui paie → 20 fiches clients jetables ;
  - sous-traitance pour transporteurs : 1 facture mensuelle déguisée en course (D FAST,
    adresse de livraison inventée pour passer l'obligation), palettes, autoliquidation à la
    main (client roumain).
- Contournements : refus + relivraison facturés en lignes supplémentaires ; annulation après
  facture faite hors outil (avoir Pennylane) ; `weight_kg` = « 420 » palettes/kg ; 42
  documents sur 67 en catégorie « Autre » ; heure prévue jamais saisie (seules les tournées
  la calculent) ; messagerie : aucune tournée de colis dans l'outil.
- Conclusion : les Notes sont devenues le vrai formulaire. Tout ce qui y est tapé doit
  devenir une case.

## 2. Critique case par case (fiche actuelle, captures du 30/09)

### Cadre
- Tiroir étroit (≈ 35 % de l'écran) sur PC : tout en une colonne, beaucoup de défilement
  pour une fiche de ~13 champs + 5 onglets. → Fiche large en 2 colonnes sur PC, pleine page
  sur mobile.
- Onglets en modification : « Montant & Suivi » et « Lettre de voiture » passent sur 2
  lignes ; 5 onglets dont POD et Documents qui font doublon (la photo POD est un document).
  → 3 onglets : Course · Preuves & documents · Facturation.
- Création = 2 onglets (Détail, Montant) : le prix est caché dans un 2e onglet et oublié.
  → Tout sur un seul écran en création.
- Bouton Enregistrer en bas du long formulaire → barre d'actions fixe en bas.
- En-tête en modification : badges statut + type + date, bien ; manque le trajet, la
  référence client, le montant, le chauffeur (résumé de la course).

### Onglet Détail
- Partir d'un modèle : invisible (0 modèle, sélecteur masqué) ; utile mais mal exposé.
  → « Dupliquer » sur la liste + modèles depuis la fiche client.
- Date planifiée* : bien obligatoire ; défaut « aujourd'hui » en UTC (peut être la veille) ;
  pas d'heure. → Date + créneaux par arrêt.
- Type (particulier / professionnel) : rempli 17/35, pas d'usage ; le « particulier » est
  une caractéristique du DESTINATAIRE. → remplacé par « Prestation » (Express, Messagerie,
  Course dédiée, Mise à disposition, Forfait / relevé mensuel), qui décide des champs.
- Client* : liste déroulante de 31 noms, dont 20 particuliers jetables ; pas de recherche.
  → champ avec recherche, et distinction Donneur d'ordre / Payeur (plateforme).
- Téléphone, e-mail, « Paiement : reception (0 jours) » sous le client : utile, mais le
  libellé brut « reception » est un code (→ « à réception »).
- Véhicule / Chauffeur : obligatoires pour partir, pas pour saisir ; pas de valeur par
  défaut ; chauffeurs = rôle chauffeur seulement (le président qui roule n'y est pas s'il
  n'a pas ce rôle). → défauts (chauffeur habituel du client / véhicule habituel du
  chauffeur), rangés dans « Exécution ».
- Description : sert de libellé de facture ET de marchandise ET de référence (« ODT
  #… »). → 3 cases : Référence client, Marchandise, Libellé facture (auto).
- Adresse d'enlèvement : utilisée 34/35 mais « facultative » ; pas de contact, pas de
  créneau, pas de GPS, aide « Vide = part du dépôt » qui prend une ligne. → bloc Retrait
  pré-rempli par l'adresse habituelle du client.
- Adresse de livraison* : obligatoire même quand elle n'a pas de sens (forfait mensuel,
  mise à disposition) ; destinataire / tél. / consignes absents (dans l'onglet LV, après
  création). → bloc Livraison complet ; obligatoire seulement pour les prestations à
  livraison.
- KM en charge + « Calculer le trajet » : calcul manuel ; doublon avec l'onglet Montant.
  → calcul automatique dès que les 2 adresses sont connues, durée affichée.
- KM à vide : 3/35, inutile ici. → supprimé de la saisie.
- Notes : 14/35 mais contiennent tout (contacts, créneaux, montant plateforme) et sont
  montrées au chauffeur. → « Consignes chauffeur » + « Note interne ».
- « Enregistrer comme modèle » : toujours visible, même en lecture seule. → action du menu.

### Onglet Montant & Suivi
- Mode tarifaire forfait / km / palette : 100 % des clients en « manuel », mode palette
  stocké dans le poids. → « Prix HT » unique + calcul auto optionnel (grille client : au
  colis, au point, à la tranche de poids, à l'heure, au km).
- Taux TVA + Montant TVA + case Autoliquidation par course : décision fiscale refaite à
  chaque saisie. → déduite du client (pays + n° TVA) ; exception possible.
- Lignes supplémentaires : utiles (seul moyen de facturer attente / relivraison) mais saisie
  libre. → catalogue en un clic (attente ¼ h, 2e présentation, retour, 2 personnes, étage,
  urgence, point supplémentaire, frais d'annulation) avec prix client.
- Suivi (frise + boutons) : correct ; manquent Replanifier / Relivrer / Retour dépôt /
  Problème réglé (échecs), motif et frais d'annulation, « Annuler par avoir » après facture.
- Pas de pied de facture carburant (obligation L3222-1), pas de référence client ni de n° LV
  ni de trajet dans le libellé de facture.

### Onglets Documents / POD / Lettre de voiture
- Documents : catégorie non choisie (42/67 « Autre ») → catégorie proposée selon le moment
  (chargement, livraison, ordre du client).
- POD : doublon de Documents + signatures ; seule la dernière photo visible.
- Lettre de voiture : ressaisit expéditeur / destinataire / marchandise / colis / poids ;
  destinataire pré-rempli avec le client (faux en sous-traitance) ; pas de donneur d'ordre,
  pas de date de prise en charge réelle, adresse transporteur non exigée, poids exigé alors
  que la loi accepte poids OU volume ; aucune LV de tournée (état récapitulatif, art. 5)
  ni CMR pour l'Allemagne. → la LV se remplit toute seule depuis la fiche.

## 3. Le formulaire proposé (un seul écran, 4 blocs, s'adapte à la prestation)
- En-tête : Prestation (Express · Messagerie · Course dédiée · Mise à disposition ·
  Forfait) · Client (recherche) · Payeur si différent · Référence client · Date · Urgent.
- Bloc Arrêts (retraits et livraisons, N arrêts) :
  - chaque arrêt : adresse (carnet d'adresses du client), nom, téléphone, créneau (au plus
    tôt / au plus tard), consignes, « particulier » (étage, ascenseur, 2 personnes, appeler
    avant) ;
  - « + Retrait », « + Livraison » (multi-drop) ; « Importer un fichier » (messagerie :
    colonnes mémorisées par client, aperçu, adresses non localisées en rouge).
- Bloc Marchandise : colis (nombre, poids, volume ou dimensions, nature, marques / codes),
  valeur déclarée (option), retour de documents / palettes ; par arrêt en messagerie.
- Bloc Exécution & prix : chauffeur, véhicule (défauts), km et durée (auto), prix HT (auto
  depuis la grille ou saisi), suppléments (catalogue), TVA (auto), libellé facture (auto,
  modifiable), port payé / port dû.
- Pied : Consignes chauffeur · Note interne · bandeau « Manque pour : partir / LV /
  facturer » · barre fixe Enregistrer · Dupliquer.
- Selon la prestation :
  - Express : 2 arrêts, créneaux, urgent ; cible 6 champs / 30 s.
  - Messagerie : import ou N arrêts, prix par colis / point, facturation au relevé mensuel.
  - Course dédiée : forfait, arrêts facultatifs au-delà de 2.
  - Mise à disposition : lieu, début / fin prévus puis réels, forfait jour / heure, km
    inclus ; heures reportées dans Heures.
  - Forfait / relevé mensuel : AUCUN arrêt, période, lignes ; plus d'adresse inventée.
- Validation progressive (ne bloque que l'étape concernée) : enregistrer = client + date ;
  partir = arrêts + chauffeur + véhicule ; LV = mentions de l'arrêté ; facturer = prix + TVA.
- Fiche client (revue Tiers) porte les défauts : adresse(s) de retrait + contact, payeur,
  pays + n° TVA (autoliquidation auto), référence obligatoire, facturation course / mensuelle,
  délai ≤ 30 j (légal en transport), grille + suppléments, modèle d'import, prévenance,
  chauffeur / véhicule habituels.

## 4. Obligations à intégrer (référentiel)
- LV : adresse transporteur obligatoire ; date de prise en charge réelle ; donneur d'ordre ;
  poids OU volume ; nom du signataire destinataire + date/heure (preuve, art. 9.2 contrat
  type) ; état récapitulatif pour tournées / messagerie (art. 5) ; CMR si hors France ;
  conservation 2 ans avec donneur d'ordre et prix.
- Facture : pied de facture carburant (L3222-1 / L3222-2) ; échéance ≤ 30 j date de facture
  (L441-11 : « 30 j fin de mois » est illégal en transport) ; pénalités + 40 € (à vérifier
  dans le modèle Pennylane) ; référence client, n° LV, trajet, colis dans le libellé ;
  client étranger : pays réel (FR codé en dur aujourd'hui) ; e-facture 09/2027 : SIREN
  client, catégorie « prestation de services ».
- International (VUL > 2,5 t) : licence communautaire, tachygraphe intelligent depuis le
  1/07/2026 → savoir quel véhicule part en Allemagne.
- Indemnisation : 33 €/kg, 1 000 €/colis max (< 3 t) sauf valeur déclarée ; attente
  facturable au-delà de 15 / 30 min.

## 5. Lots proposés
- Lot A — fiche unique : 1 écran large, blocs Ordre / Arrêts (1 retrait + 1 livraison
  complets) / Marchandise / Exécution & prix, Prestation, Référence client, créneaux,
  contacts, consignes / note interne, km auto, barre fixe, validation progressive, LV
  remplie depuis la fiche, 3 onglets en modification. (migrations additives : référence,
  créneaux retrait/livraison, prestation, consignes, volume, payeur.)
- Lot B — fiche client : défauts (retrait habituel, TVA auto, référence obligatoire, délai
  plafonné 30 j, payeur), recherche client, suppléments catalogue.
- Lot C — échecs et annulation : Relivrer (chaîné), Retour dépôt / expéditeur, Problème
  réglé, frais d'annulation, annulation par avoir.
- Lot D — multi-arrêts + messagerie : N arrêts / colis, import fichier, LV de tournée
  (état récapitulatif), relevé mensuel.
- Lot E — conformité facture : pied carburant, références dans le libellé, pays client,
  CMR.
