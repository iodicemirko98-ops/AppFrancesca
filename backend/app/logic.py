"""Logica pura (senza database): codici invito, giorni insieme, date tonde."""
import calendar
import secrets
from datetime import date, datetime
from zoneinfo import ZoneInfo

INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # niente 0/O, 1/I

MODULES = {
    "calendario": True,
    "attivita": True,
    "liste": True,
    "domanda": True,
    "decidere": True,
    "fare_insieme": True,
    "desideri": True,
    "buono_a_sapersi": True,
    "note": True,
    "viaggi": True,
    "risparmi": True,
    "spese": True,
    "cassaforte": True,
    "disegno": True,
    "ciclo": False,  # opzionale, disattivato di default
    "anno": True,
    "trivia": True,
}

NOTIFICATION_TYPES = {
    "eventi": True,
    "attivita": True,
    "solleciti": True,
    "domanda": True,
    "risposta_partner": True,
    "sondaggi": True,
    "capsule": True,
    "regali": True,
    "trivia": True,
}

# Collezioni (aggiunte nelle fasi successive) i cui documenti hanno `couple_id`
# e vanno spostati nello spazio condiviso quando il partner si collega.
COUPLE_COLLECTIONS: list[str] = ["events", "tasks", "task_categories", "lists", "notifications", "answers", "polls", "bucket", "wishes", "facts", "notes", "trips", "goals", "expenses", "vault", "drawings", "trivia_matches"]

DAY_MILESTONES = [100, 200, 300, 500, 1000, 1500, 2000, 2500, 3000]


def new_invite_code() -> str:
    return "".join(secrets.choice(INVITE_ALPHABET) for _ in range(6))


def now_rome() -> datetime:
    return datetime.now(ZoneInfo("Europe/Rome")).replace(tzinfo=None, second=0, microsecond=0)


def today_rome() -> date:
    return datetime.now(ZoneInfo("Europe/Rome")).date()


def days_together(start: date, today: date) -> int:
    """Il giorno di inizio conta come giorno 1."""
    return (today - start).days + 1


def add_months(d: date, months: int) -> date:
    y, m = divmod(d.month - 1 + months, 12)
    year, month = d.year + y, m + 1
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))


def month_label(months: int) -> str:
    if months % 12 == 0:
        years = months // 12
        return "1 anno" if years == 1 else f"{years} anni"
    return f"{months} mesi"


def milestones(start: date, upto_year: int) -> list[tuple[date, str]]:
    """Tutte le date tonde fino a `upto_year`, in ordine di data."""
    found: dict[date, str] = {}
    for n in DAY_MILESTONES:
        found[start.fromordinal(start.toordinal() + n - 1)] = f"{n} giorni"
    months = 6
    while add_months(start, months).year <= upto_year:
        found[add_months(start, months)] = month_label(months)
        months += 6
    return sorted(found.items())


def milestone_info(start: date, today: date) -> dict:
    items = milestones(start, today.year + 3)
    todays = next((label for d, label in items if d == today), None)
    upcoming = next(((d, label) for d, label in items if d > today), None)
    return {
        "today": todays,
        "next": (
            {"label": upcoming[1], "date": upcoming[0].isoformat(), "in_days": (upcoming[0] - today).days}
            if upcoming
            else None
        ),
    }
