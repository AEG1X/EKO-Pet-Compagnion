# 0006 — Fiche publique de secours dans R2

Date : 31/10/2026 · Statut : accepté

## Contexte

La fiche de la médaille doit rester lisible même si D1 est momentanément indisponible (cahier des charges, section 6). Le dossier de conception prévoyait un instantané dans Workers KV.

## Décision

L'instantané est écrit dans le bucket R2 déjà lié au Worker (`public/medal/<identifiant>.json`), et non dans KV :

- aucun service ni réglage supplémentaire à créer, R2 étant déjà en place ;
- une écriture uniquement quand la fiche change (empreinte SHA-256 comparée), donc quelques opérations par mois ;
- la fiche est lue dans D1 ; si D1 échoue, le Worker relit l'instantané R2 ;
- quand l'adresse est remplacée ou désactivée, l'instantané correspondant est supprimé aussitôt : une médaille révoquée ne s'affiche pas, même en secours.

## Conséquences

En cas de panne de D1, la fiche affiche l'état de la dernière modification. Le compteur de visites n'est alors pas mis à jour.
