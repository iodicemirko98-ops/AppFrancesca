# NoiDue — fasi 1 e 2

**Fase 1** — autenticazione, abbinamento con codice invito, home con contatore dei giorni e date tonde,
impostazioni (profilo, tema, notifiche, sezioni, esportazione dati, cancellazione account). PWA installabile.

**Fase 2** — calendario (vista mese + agenda, eventi con ripetizioni, categorie, promemoria), attività
(assegnate a uno, all'altro o a entrambi, categorie, scadenze, solleciti con messaggi sempre più insistenti),
liste condivise (spesa, film, viaggi…), cestino "Eliminati di recente" (7 giorni), notifiche in-app e
sincronizzazione in tempo reale tra i due telefoni (WebSocket).

**Fase 3** — domanda del giorno (risposte segrete finché non rispondete entrambi, con storico), decidere insieme
(sondaggi a voto segreto, sorteggio in caso di pareggio, sorteggio rapido) e da fare insieme (lista di cose da vivere,
con ricordo dopo averle fatte e "cosa facciamo?" casuale).

**Fase 4** — desideri con radar regali (chi regala può prenotare in segreto, chi riceve non lo vede mai; idee segrete visibili
solo a chi le scrive), buono a sapersi (taglie, gusti, codici…), note, capsule del tempo (sigillate per entrambi fino alla
data scelta) e storie, viaggi con mappa e diario. La ricerca dei luoghi usa OpenStreetMap (Nominatim) dal tuo browser: è
l'unica richiesta a un servizio esterno dell'app, insieme ai riquadri della mappa.

**Fase 5** — risparmi (obiettivi con versamenti e prelievi), spese comuni (saldo del mese, per categoria, «Salda»), cassaforte
(PIN personale, contenuti cifrati nel database, si richiude da sola), disegno condiviso (i tratti compaiono subito all'altro),
ciclo (privato, spento di default: il partner vede solo un riassunto se scegli di condividerlo) e il riepilogo «Il nostro anno».
Per la cassaforte puoi impostare `VAULT_KEY` su Render: se non c'è si usa `JWT_SECRET`, e cambiarlo dopo renderebbe illeggibili i contenuti.

**Grafica** — serif Cormorant + Outfit (inclusi nell'app, nessuna richiesta a servizi esterni), icone a linea, barra a pillola.
Le fasi successive si aggiungono sopra questa base.

## Provare in locale
Serve MongoDB (locale o gratuito su Atlas).

    cd backend
    cp .env.example .env        # inserisci MONGO_URL e un JWT_SECRET lungo
    pip install -r requirements.txt
    uvicorn app.main:app --reload

    cd ../frontend
    npm install
    npm run dev                 # http://localhost:5173 (le chiamate /api vanno al backend)

Test del backend (non serve MongoDB): `cd backend && pytest`
Dati di esempio, solo su un database di prova: `DB_NAME=noidue_demo python seed.py`

## Metterla online (gratis)
1. **MongoDB Atlas**: crea un cluster M0 gratuito, un utente e abilita l'accesso da ovunque (0.0.0.0/0);
   copia la stringa di connessione.
2. **Render**: New > Blueprint, scegli questo repository (legge `render.yaml`). Inserisci `MONGO_URL`.
   Annota l'indirizzo del servizio, tipo `https://noidue-api-eu.onrender.com`.
3. **Vercel**: New Project, stesso repository, *Root Directory* = `frontend`, variabile
   `VITE_API_URL` = indirizzo del servizio Render. Annota l'indirizzo del sito.
4. Torna su Render e imposta `CORS_ORIGINS` = indirizzo del sito Vercel, poi riavvia.
5. Apri il sito, crea lo spazio, manda il codice invito. Sul telefono: Condividi > Aggiungi a Home.

Il piano gratuito di Render mette il server in pausa dopo 15 minuti: il primo accesso impiega circa un minuto.

## Privacy
Nessuna pubblicità né analytics di terzi. Le registrazioni si chiudono dopo due account (`MAX_USERS`).


## Fase 6 — offline, notifiche push, rifiniture

- **Offline**: l'app si apre anche senza rete con gli ultimi dati letti (IndexedDB). Attività e voci delle liste si possono creare, spuntare ed eliminare offline: le modifiche restano in coda, un banner le segnala e vengono inviate al ritorno della connessione. Cassaforte, ciclo, export e login non vengono mai salvati in locale; all'uscita la copia locale viene cancellata.
- **Notifiche push** (Web Push, chiavi VAPID generate automaticamente e salvate nel database): si attivano da *Impostazioni → Notifiche → Su questo dispositivo*. Su iPhone serve prima «Aggiungi a Home». Endpoint: `/api/push/key|subscribe|unsubscribe|status`.
- **Promemoria automatici** (scheduler interno, ogni minuto, senza duplicati): promemoria degli eventi con orario, domanda del giorno dopo le 19 a chi non ha risposto, attività in scadenza oggi dalle 8.
- **Render piano gratuito**: il servizio si addormenta dopo 15 minuti, e con lui lo scheduler. Per promemoria puntuali fai chiamare `https://noidue-api-eu.onrender.com/health` ogni 5–10 minuti (UptimeRobot gratuito, oppure una GitHub Action con cron).
- Animazioni di entrata leggere, disattivate con `prefers-reduced-motion`.

### Recupero password
- **Con il partner**: Impostazioni → «Codice di recupero» genera un codice monouso di 8 caratteri (15 minuti, 5 tentativi). Chi ha dimenticato la password usa «Password dimenticata?» nel login.
- **D'emergenza** (se non c'è un partner che possa aiutare): su Render aggiungi le variabili `RESET_EMAIL` e `RESET_PASSWORD` (min. 8 caratteri), attendi il riavvio, accedi, poi **rimuovile**.

### Colori e sfondo
Impostazioni → «Colori e sfondo»: un cursore cambia la tinta di tutta l'app (chiaro e scuro, con contrasto garantito) e vale solo per chi lo sceglie (campo `look` del profilo). Sfondi: semplice, sfumatura, aloni, puntini (seguono il colore) oppure una foto, salvata solo sul dispositivo con regolazione della schiaritura.

## Fase 7 — Trivia
Sezione **Trivia** (Altro → Trivia): sfide a due su 10 domande uguali per entrambi, 15 secondi a domanda, 100 punti per risposta esatta più fino a 50 di bonus velocità. 147 domande in 8 categorie (geografia, cultura pop, scienze, storia, sport, cibo, arte e letteratura, natura) più «mix»; le domande già viste di recente non si ripetono. Ognuno gioca quando vuole: il punteggio dell'altro si vede solo quando avete finito entrambi, con classifica vittorie. Le domande stanno in `backend/app/trivia_bank.py`.

### Le nostre foto
Altro → «Le nostre foto»: album condiviso (fino a 80 foto, compresse sul telefono prima dell'invio). Le foto con la ★ compaiono nel **carosello della home** (massimo 12, scorre da solo ogni 5 secondi e col dito). Didascalie, selezione multipla con annulla, cestino di 7 giorni. API: `/api/photos`.


### Trivia: Harry Potter
Categoria a tema (54 domande: libri, film, magia, trama, curiosità), fuori dal «mix». Ogni domanda ha un'etichetta e molte hanno un «Lo sapevi?» mostrato dopo la risposta; a fine partita il Cappello Parlante assegna un grado in base alle risposte giuste.

### Keep-alive
Il workflow `.github/workflows/keepalive.yml` chiama `/health` ogni 5 minuti per evitare che Render free vada in sleep (serve anche allo scheduler delle notifiche). Alternativa: UptimeRobot.

### Ricettario
Sezione `/ricette`: ricette con link (Instagram o altro), categoria, ingredienti, procedimento, foto, preferita, provata e voto. Su Android (app installata) «Condividi» da Instagram → NoiDue apre il modulo già compilato con il link (Web Share Target; su iPhone si incolla il link).
