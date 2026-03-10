# Il Tuo Allenatore 4.0 - Piattaforma utenti

Applicazione web React + Express + SQLite con:

- Home con login utente.
- Se non esistono utenti nel database, accesso diretto alla gestione utenti.
- Gestione utenti con permessi: solo coach può creare/eliminare utenti; atleta vede e modifica solo il proprio profilo (senza cambiare username).
- Campi utente estesi: username, password, nome, cognome, email, cellulare, tipologia (coach/atleta).

## Avvio

```bash
npm install
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3001

## Note

- Database SQLite locale: `app.db`.
- Per semplicità le password sono salvate in chiaro (ambiente demo/sviluppo).

- Migrazione database non distruttiva: all'avvio vengono aggiunte solo le colonne mancanti senza perdere i dati esistenti.
