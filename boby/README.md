# Boby — navigatore a comando vocale (PWA)

Mappa disegnata su misura ("Notte di sodio") con MapLibre + tile OpenFreeMap, percorsi OSRM,
ricerca Photon/Nominatim, "più vicino" via Overpass. Voce: Web Speech API (it-IT).

Di' **«Hey Boby, portami a …»**. Altri comandi: «portami al benzinaio più vicino», «portami a casa»,
«imposta casa qui», «quanto manca», «ripeti», «termina navigazione», «muto», «simula».
Doppio tocco sull'orb = simulazione del percorso.

Locale: `python3 -m http.server 8080` dentro `boby/` (serve HTTPS o localhost per microfono e GPS).
