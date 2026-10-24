# Aria Showroom 3D (concept non ufficiale)

Sito statico 3D (three.js) con tre auto, configuratore visivo e «Aria, assistente del concept»
(assistente AI con risposte predefinite, tutto in locale). Non affiliato a Tesla, Inc. Nessun prezzo,
nessun modulo, nessuna richiesta a server esterni.

## Provarlo in locale
    python3 -m http.server 8080   # dalla cartella del sito
    # apri http://localhost:8080

## Aggiungere o sostituire un modello CC BY
    gltf-transform optimize input.glb assets/models/model3.glb --texture-compress webp --compress meshopt --simplify
    # (o --texture-compress ktx2 se è installato toktx). Budget: hero ≤ 3 MB, altri ≤ 2 MB.
Poi in `js/config.js` imposta `glb`, `lengthM` e `credit`, e aggiorna CREDITS.md. Rimuovi loghi e badge (geometria e texture). Ogni nuovo modello va approvato da Guard prima di andare online. Gli script usati per i modelli attuali sono in `work/gt/` (proc.mjs).

## Pubblicazione (GitHub Pages) — solo dopo l'OK dell'utente e la rilettura di Guard
    git init && git add . && git commit -m "Aria Showroom 3D v1"
    gh repo create aria-showroom-3d --public --source . --push
    gh api -X POST repos/{owner}/aria-showroom-3d/pages -f "source[branch]=main" -f "source[path]=/"
