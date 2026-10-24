# Crediti — Aria Showroom 3D (concept non ufficiale)

Concept non ufficiale a scopo dimostrativo. Non affiliato, sponsorizzato o approvato da Tesla, Inc.
Tesla e i nomi dei modelli sono marchi dei rispettivi titolari.

## Modelli 3D delle auto
Tre modelli di terzi con licenza **CC BY 4.0** (https://creativecommons.org/licenses/by/4.0/), scaricati il 24/10/2026.
Licenza verificata il 24/10/2026 sull'API pubblica di Sketchfab (campo license = «CC Attribution»).
La licenza copre la mesh, non i marchi né il design delle auto. Loghi e badge rimossi dalla geometria; texture controllate a vista.

| Auto | Titolo | Autore | URL | Licenza | Scaricato da | Modifiche |
|---|---|---|---|---|---|---|
| Model 3 | «Tesla Model 3» | [David_Holiday](https://sketchfab.com/David_Holiday) | https://sketchfab.com/3d-models/tesla-model-3-123c10f376ec4f18b93c73afc382808b | CC BY 4.0 | https://github.com/wass08/r3f-3d-slideshow (`public/models/`, commit 999289d) | oggetti di scena tolti; emblema T anteriore e posteriore rimosso (4 isole cromate); materiali sostituiti; compressione meshopt + WebP |
| Model Y | «Tesla Model Y 2021» | [763468712](https://sketchfab.com/763468712) | https://sketchfab.com/3d-models/tesla-model-y-2021-c0a86cac582d4b33aba0fb1b1912d970 | CC BY 4.0 | https://github.com/Tina2088/tina-3d-tesla (commit 5f81eea), adattamento di Tina 3D Tesla (normalizzazione, separazione mesh, riduzione poligoni, materiali) | loghi T rimossi (coprimozzi, portellone, muso: nodi MY-001…004, 263, 264, 314, 315); mesh semplificata (~309k triangoli); materiali sostituiti; compressione meshopt + WebP |
| Cybertruck | «Tesla Cybertruck» | [hashikemu](https://sketchfab.com/hashikemu) | https://sketchfab.com/3d-models/tesla-cybertruck-657e71b3e2ad468196668e9c9df708fb | CC BY 4.0 | https://github.com/wass08/r3f-3d-slideshow (`public/models/`, commit 999289d) | oggetti di scena tolti; nessun logo nella geometria né nelle texture; materiali sostituiti; compressione meshopt + WebP |

Nota sul Cybertruck: il repository di origine lo accredita «by Hashikemu» tramite market.pmnd.rs (sito non più online);
l'abbinamento al modello Sketchfab indicato (stesso autore e stesso titolo, numero di poligoni compatibile) è una deduzione.

Formato dell'attribuzione visibile sul sito (sezione Crediti): «"Titolo" di Autore, CC BY 4.0, modificato».

Riserva: se un GLB non si carica, il sito usa una sagoma procedurale generica generata nel codice (`js/car.js`),
creata per questo progetto, senza modelli di terzi né loghi.

## Illuminazione
- HDRI «Studio Small 09» di Sergej Majboroda, Poly Haven — https://polyhaven.com/a/studio_small_09 — CC0.
  Modifica: ridotto da 1K a 256×128 px.

## Codice e font
- three.js r180 — MIT — https://threejs.org — `licenses/three-MIT.txt`
  (inclusi addon GLTFLoader, DRACOLoader, KTX2Loader, meshopt decoder, transcoder Basis, post-processing)
- Space Grotesk — SIL OFL 1.1 — `licenses/OFL-space-grotesk.txt`
- Inter — SIL OFL 1.1 — `licenses/OFL-inter.txt`
- JetBrains Mono — SIL OFL 1.1 — `licenses/OFL-jetbrains-mono.txt`
  (file woff2 da @fontsource-variable, ospitati in locale)

## Dati
Specifiche da https://www.tesla.com/it_it (pagine Model 3, Model Y, Cybertruck), consultate il 24/10/2026.
Valori indicativi, possono essere cambiati. Nessun prezzo.

## Assistente
«Aria, assistente del concept»: risposte predefinite in `data/aria-qa.json`, nessuna API esterna.
