# NoiDue — fasi 1 e 2

**Fase 1** — autenticazione, abbinamento con codice invito, home con contatore dei giorni e date tonde,
impostazioni (profilo, tema, notifiche, sezioni, esportazione dati, cancellazione account). PWA installabile.

**Fase 2** — calendario (vista mese + agenda, eventi con ripetizioni, categorie, promemoria), attività
(assegnate a uno, all'altro o a entrambi, categorie, scadenze, solleciti con messaggi sempre più insistenti),
liste condivise (spesa, film, viaggi…), cestino "Eliminati di recente" (7 giorni), notifiche in-app e
sincronizzazione in tempo reale tra i due telefoni (WebSocket).
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
   Annota l'indirizzo del servizio, tipo `https://noidue-api.onrender.com`.
3. **Vercel**: New Project, stesso repository, *Root Directory* = `frontend`, variabile
   `VITE_API_URL` = indirizzo del servizio Render. Annota l'indirizzo del sito.
4. Torna su Render e imposta `CORS_ORIGINS` = indirizzo del sito Vercel, poi riavvia.
5. Apri il sito, crea lo spazio, manda il codice invito. Sul telefono: Condividi > Aggiungi a Home.

Il piano gratuito di Render mette il server in pausa dopo 15 minuti: il primo accesso impiega circa un minuto.

## Privacy
Nessuna pubblicità né analytics di terzi. Le registrazioni si chiudono dopo due account (`MAX_USERS`).
