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
- Lot B — fiche client : FAIT (§ 6 ter), payeur abandonné au profit de « client = qui paie ».
- Lot C — échecs et annulation : Relivrer (chaîné), Retour dépôt / expéditeur, Problème
  réglé, frais d'annulation, annulation par avoir.
- Lot D — multi-arrêts + messagerie : N arrêts / colis, import fichier, LV de tournée
  (état récapitulatif), relevé mensuel.
- Lot E — conformité facture : pied carburant, références dans le libellé, pays client,
  CMR.

## 6. Lot A — livré (branche `claude/epic-volta-o6n6oo`, au-dessus de la PR #34)
- Migration `20261001090000_deliveries_fiche_unique.sql` (additive) : `prestation`,
  `reference_client`, `urgent`, `creneau_retrait_debut/fin`, `creneau_livraison_debut/fin`,
  `volume_m3`, `duree_min`, `note_interne`. `notes` = consignes chauffeur (inchangé en base).
- Fiche large (80 rem) en 2 colonnes PC, 1 colonne mobile :
  - Ordre : Prestation (5 pastilles + aide), Client avec recherche, délai de paiement,
    Référence client, Date (locale, plus d'UTC), Urgent ;
  - Retrait / Livraison : adresse, qui remet / qui reçoit + téléphone, créneau au plus tôt /
    au plus tard (fin avant début = bloquant) ;
  - Trajet : km + durée calculés tout seuls (IGN, 1,2 s après la saisie des 2 adresses),
    bouton Recalculer ;
  - Marchandise : nature, colis, poids, volume ;
  - Exécution & prix : chauffeur, véhicule, libellé de facture, prix HT, TVA (taux + montant
    sur une ligne), autoliquidation, suppléments ;
  - Consignes chauffeur / Note interne ;
  - bandeau « Il manque pour partir / la LV / facturer » ; seuls client + date bloquent.
- Barre d'actions fixe : Enregistrer, Annuler + pictos Modèle, Dupliquer, Supprimer.
- Dupliquer : copie en création (date du jour, sans référence, sans preuve ni statut).
- 3 onglets : Course · Preuves & documents (Preuve / LV / Fichiers) · Facturation (suivi +
  récap + état Pennylane).
- Selon la prestation : Forfait = aucun arrêt ; Mise à disposition = un seul « Lieu » +
  début / fin ; les autres = retrait + livraison.
- Facture : « — Réf. <référence client> » ajouté au libellé (Edge + aperçu, identiques).
- Mes courses : créneau de l'arrêt + pastille Urgent.
- Champs partagés avec l'onglet LV (expéditeur, destinataire, marchandise, colis, poids) :
  réécrits seulement s'ils ont changé dans la fiche (pas d'écrasement de la saisie LV).
- Ordre de mise en prod : migration AVANT le front et l'Edge `pennylane-invoice`
  (sinon la lecture de `reference_client` échoue).

## 6 bis. Messagerie = relevé mensuel au colis (validé 01/10/2026)
- Fonctionnement réel : prix HT au colis (ex. 1 €), facturé au mois : nb de colis livrés × prix.
- Une seule saisie par donnée :
  - prix au colis → fiche client, tarif « Au colis (messagerie) » (une fois) ;
  - nb de colis → la fiche livraison, prestation Messagerie (une fois par mois) ;
  - le prix est recopié sur le relevé (`prix_unitaire_cts`) : changer le tarif ne réécrit pas l'historique.
- Fiche en Messagerie : Client · Référence · Mois relevé · Colis livrés · Prix au colis →
  « 1 240 colis × 1,00 € = 1 240,00 € HT », TVA, suppléments, note interne. Rien d'autre.
- Choisir un client « au colis » bascule une nouvelle fiche en Messagerie, prix pré-rempli ;
  mois proposé = mois précédent jusqu'au 10, sinon le mois en cours. Date stockée = fin de mois.
- Le relevé naît « Livrée » (prêt à facturer), sans preuve unitaire attendue.
- Facture Pennylane : 1 ligne, quantité = colis, PU = prix au colis, libellé
  « Messagerie septembre 2026 — colis livrés » (+ Réf. client) ; aperçu identique.
- Partout ailleurs :
  - liste Livraisons : « Messagerie · 1 240 colis » à la place du trajet ;
  - Mes courses, tournées, planning, calendrier, journée du Dashboard : relevés exclus ;
  - CA, à facturer, encaissement, relances : inchangés (le relevé est une ligne comme une autre).

## 6 ter. Lot B — fiche client = défauts des courses (01/10/2026)
- Migration `20261001120000_clients_defauts_fiche.sql` : `pays` (FR), `retrait_adresse /
  contact / tel`, `chauffeur_habituel_id`, `vehicule_habituel_id`, `prestation_defaut`,
  `reference_obligatoire`, `supplements` (jsonb `[{label, prix_ht_cts}]`).
- Fiche client en blocs (2 colonnes PC) : Identité (+ pays) · Facturation (délai, référence
  obligatoire, autoliquidation) · Tarif + suppléments · Habitudes · Notes ; barre fixe, pictos.
- Nouvelle course : choisir le client remplit les cases VIDES (prestation, retrait + contact,
  chauffeur, véhicule, autoliquidation si client UE hors France avec n° de TVA).
- Suppléments en un clic dans la fiche livraison (catalogue du client, sinon libellés usuels).
- Référence obligatoire : « Il manque pour facturer », refus dans la fiche ET dans l'Edge
  (factures groupées comprises).
- Délai : seuls « à réception / 15 j / 30 j » se choisissent (L441-11) ; les anciens 45 / 60 /
  fin de mois restent affichés « non conforme » ; l'Edge plafonne l'échéance à 30 j.
- Facture Pennylane : pays réel du client (fini le FR codé en dur).
- **Payeur ≠ donneur d'ordre : abandonné.** Règle : le client = celui qui commande ET paie
  (la plateforme, le commissionnaire) ; le particulier est un contact d'arrêt (qui remet / qui
  reçoit). Un seul concept, pas de double facturation à gérer. Les ~20 fiches de particuliers
  jetables pourront être fusionnées / désactivées (à décider).

## 7. Liste longue — vu par un gestionnaire d'exploitation
### Saisie
- Saisie rapide « coller un message » : on colle l'ordre (mail HOPHOP, message Cocolis) →
  l'IA (Mistral) remplit adresses, contacts, créneau, référence, prix ; on valide.
- Import d'un PDF d'ordre de transport → même remplissage, PDF rangé en « Ordre client ».
- Carnet d'adresses par client (retraits / livraisons fréquents) avec contact et consignes.
- Adresse de retrait par défaut = adresse habituelle du client.
- Chauffeur / véhicule par défaut = habituels du client, sinon le dernier utilisé.
- Prix proposé automatiquement : dernier prix du même trajet pour ce client.
- Grille tarifaire client : au colis, au point, à la tranche de poids, au km, à l'heure.
- Suppléments en un clic (attente ¼ h, 2e présentation, étage, 2 personnes, urgence, retour).
- Saisie en lot : coller un tableau (Excel) de N livraisons → N courses en un geste.
- Course récurrente (tous les lundis, tous les jours ouvrés) générée automatiquement.
- Raccourcis clavier PC : Ctrl+Entrée enregistrer, Ctrl+D dupliquer, Échap fermer.
- Brouillon auto : une fiche fermée par erreur se rouvre avec la saisie.
- Contrôle de doublon : même client + même date + même adresse → avertissement.
- Adresse non localisée / hors zone habituelle → alerte avant enregistrement.
- Téléphones : format vérifié (06…/+33), lien d'appel direct.
- Champ « valeur déclarée » (au-delà du plafond légal 33 €/kg, 1 000 €/colis) + alerte assurance.
- Marchandise sensible (fragile, frigo, valeur, ADR exclu) → pictogramme chez le chauffeur.
- Particulier : étage, ascenseur, digicode, 2 personnes, appeler avant (cases, pas du texte).
- Payeur différent du donneur d'ordre (plateformes) → facture au bon client (lot B).
### Exploitation
- Faisabilité du créneau : heure de départ conseillée = créneau − durée du trajet.
- Charge du chauffeur ce jour-là (nb de courses, heures) visible au moment d'affecter.
- Capacité du véhicule (volume / charge utile) comparée à la marchandise.
- Contrôle tachygraphe : un VUL > 2,5 t qui part à l'étranger doit avoir le tachygraphe G2V2.
- Documents du véhicule / chauffeur échus (assurance, CT, permis) → blocage du départ.
- Statut « affectée / confirmée par le chauffeur » (accusé de lecture dans Mes courses).
- Suivi en direct : position du chauffeur, heure d'arrivée estimée envoyée au client.
- SMS / e-mail automatique au destinataire : « votre livreur arrive entre 14 h et 15 h ».
- Lien de suivi public pour le client (statut, preuve, sans connexion).
- Échec terrain → bouton « Relivrer demain » qui crée la course liée avec frais (lot C).
- Retour au dépôt / à l'expéditeur avec frais, motif et photo.
- Historique de la course : qui a changé quoi, quand (journal).
- Commentaires internes horodatés au lieu d'une seule note.
- Pièces : bon de commande client, photo au chargement, photo à la livraison, signature.
### Facturation & finance
- Prix de revient estimé (km × coût/km + heures × coût horaire) et marge affichée.
- Seuil de marge mini : alerte si la course est sous le coût de revient.
- Pied de facture carburant (indexation gazole, obligatoire) — lot E.
- Échéance plafonnée à 30 j date de facture (transport) — lot B.
- Relevé mensuel : toutes les courses du mois d'un client sur une facture, avec détail.
- Avoir en un clic sur une course facturée annulée (lot C).
- Suppléments signalés par le chauffeur (attente constatée) → proposés au bureau.
- Facture envoyée automatiquement avec preuve de livraison jointe.
- Relance automatique à échéance + 7 j / + 15 j.
- E-facture 09/2027 : SIREN client obligatoire dès la fiche client.
### Pilotage
- Taux de livraisons dans le créneau, taux d'échec, délai moyen de facturation.
- Chiffre d'affaires et marge par client, par chauffeur, par véhicule, par prestation.
- Clients à faible marge, clients payeurs tardifs.
- Km à vide (retours) suivis par véhicule, pas par course.
### Messagerie (lot D)
- Tournée = N arrêts / N colis, import du fichier client, ordre optimisé.
- Scan code-barres colis (téléphone) au chargement et à la livraison.
- Preuve par colis, statut par colis (livré, absent, refusé, endommagé).
- État récapitulatif (LV de tournée, art. 5 de l'arrêté).
- Facturation au colis / au point, relevé mensuel automatique.
