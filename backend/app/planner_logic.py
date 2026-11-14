"""Logica pura della fase 2: ricorrenze del calendario e messaggi dei solleciti."""
from datetime import date, datetime, timedelta

from .logic import add_months

EVENT_CATEGORIES = ["noi", "lavoro", "famiglia", "amici", "viaggi", "casa"]
EVENT_TYPES = ["evento", "compleanno", "anniversario"]
RECURRENCES = ["nessuna", "giornaliera", "settimanale", "mensile", "annuale"]
CATEGORY_COLORS = ["#C2603F", "#D49A3A", "#6E9B6B", "#4F8FA8", "#8B6BB1", "#C4577A", "#7A6A5E", "#3F7F74"]

NUDGES = [
    "{who} ti ricorda con dolcezza: «{task}»",
    "{who} insiste (con affetto): «{task}» ti sta aspettando",
    "Secondo promemoria da {who} per «{task}». Far finta di niente non funziona 😏",
    "{who} sta iniziando a perdere la pazienza: «{task}»!",
    "Quarto avviso per «{task}». {who} ha controllato l'orologio e il tempo vola ⏰",
    "{who} ha chiamato i rinforzi per «{task}»: non hai via di scampo 🚨",
    "A questo punto «{task}» è una questione di Stato. Firmato: {who} 🏛️",
    "{who} sta scrivendo «{task}» sul muro della vergogna 🙈",
    "{who} sta per pubblicare un annuncio di persona scomparsa per «{task}» 📢",
    "Ultimo avviso della storia: «{task}». {who} non smetterà mai. Mai. 🫡",
]


def nudge_text(count: int, who: str, task: str) -> str:
    """`count` = quanti solleciti sono già stati mandati prima di questo."""
    return NUDGES[min(count, len(NUDGES) - 1)].format(who=who, task=task)


def parse_when(s: str) -> tuple[datetime, bool]:
    """'YYYY-MM-DD' = tutto il giorno; 'YYYY-MM-DDTHH:MM' = con orario."""
    if len(s) == 10:
        d = date.fromisoformat(s)
        return datetime(d.year, d.month, d.day), True
    return datetime.fromisoformat(s).replace(second=0, microsecond=0, tzinfo=None), False


def fmt_when(dt: datetime, all_day: bool) -> str:
    return dt.date().isoformat() if all_day else dt.strftime("%Y-%m-%dT%H:%M")


def expand(event: dict, range_start: date, range_end: date, cap: int = 800) -> list[tuple[str, str]]:
    """Occorrenze (inizio, fine) dell'evento che toccano l'intervallo [range_start, range_end]."""
    s0, all_day = parse_when(event["start"])
    e0 = parse_when(event["end"])[0] if event.get("end") else s0
    dur = e0 - s0
    dur_days = dur.days
    rec = event.get("recurrence", "nessuna")

    def at(n: int) -> datetime:
        if rec == "giornaliera":
            d = s0.date() + timedelta(days=n)
        elif rec == "settimanale":
            d = s0.date() + timedelta(days=7 * n)
        elif rec == "mensile":
            d = add_months(s0.date(), n)
        elif rec == "annuale":
            d = add_months(s0.date(), 12 * n)
        else:
            d = s0.date()
        return datetime.combine(d, s0.time())

    n = 0
    if rec in ("giornaliera", "settimanale"):
        step = 1 if rec == "giornaliera" else 7
        n = max(0, ((range_start - s0.date()).days - dur_days) // step - 1)
    elif rec == "mensile":
        months = (range_start.year - s0.year) * 12 + range_start.month - s0.month
        n = max(0, months - dur_days // 28 - 2)
    elif rec == "annuale":
        n = max(0, range_start.year - s0.year - dur_days // 365 - 2)

    out: list[tuple[str, str]] = []
    while len(out) < cap:
        start = at(n)
        if start.date() > range_end:
            break
        end = start + dur
        if end.date() >= range_start:
            out.append((fmt_when(start, all_day), fmt_when(end, all_day)))
        if rec == "nessuna":
            break
        n += 1
        if n > 100_000:
            break
    return out


def occurrence_doc(event: dict, start: str, end: str) -> dict:
    return {
        "id": event["_id"],
        "key": f"{event['_id']}@{start}",
        "title": event["title"],
        "start": start,
        "end": end,
        "all_day": len(start) == 10,
        "location": event.get("location"),
        "notes": event.get("notes"),
        "category": event.get("category", "noi"),
        "type": event.get("type", "evento"),
        "recurrence": event.get("recurrence", "nessuna"),
        "reminder": event.get("reminder"),
        "is_recurring": event.get("recurrence", "nessuna") != "nessuna",
    }


def upcoming(events: list[dict], now: datetime, limit: int = 3, horizon_days: int = 400) -> list[dict]:
    """Prossime occorrenze non ancora concluse, in ordine di inizio."""
    found = []
    for ev in events:
        for s, e in expand(ev, now.date(), now.date() + timedelta(days=horizon_days)):
            end_dt, all_day = parse_when(e)
            if all_day:
                end_dt += timedelta(days=1)
            if end_dt > now:
                found.append(occurrence_doc(ev, s, e))
    found.sort(key=lambda o: (o["start"], o["title"]))
    return found[:limit]
