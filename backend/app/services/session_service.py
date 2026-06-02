import logging
import uuid
from typing import Any, Optional
from typing_extensions import override

from google.adk.errors.already_exists_error import AlreadyExistsError
from google.adk.events.event import Event
from google.adk.platform import time as platform_time
from google.adk.sessions import BaseSessionService, Session, State
from google.adk.sessions.base_session_service import GetSessionConfig, ListSessionsResponse
from google.adk.sessions import _session_util

from app.database import SessionLocal
from app.models.models import ADKSessionModel, ADKAppStateModel, ADKUserStateModel

logger = logging.getLogger("app.services.session_service")

class DatabaseSessionService(BaseSessionService):
    def __init__(self, session_factory=SessionLocal):
        self.session_factory = session_factory

    @override
    async def create_session(
        self,
        *,
        app_name: str,
        user_id: str,
        state: Optional[dict[str, Any]] = None,
        session_id: Optional[str] = None,
    ) -> Session:
        session_id = session_id.strip() if session_id and session_id.strip() else str(uuid.uuid4())

        with self.session_factory() as db:
            existing = db.query(ADKSessionModel).filter(
                ADKSessionModel.app_name == app_name,
                ADKSessionModel.user_id == user_id,
                ADKSessionModel.id == session_id,
            ).first()
            if existing:
                raise AlreadyExistsError(f"Session with id {session_id} already exists.")

            state_deltas = _session_util.extract_state_delta(state)
            app_state_delta = state_deltas["app"]
            user_state_delta = state_deltas["user"]
            session_state = state_deltas["session"]

            if app_state_delta:
                app_state_rec = db.query(ADKAppStateModel).filter(
                    ADKAppStateModel.app_name == app_name
                ).first()
                if not app_state_rec:
                    app_state_rec = ADKAppStateModel(app_name=app_name, state={})
                    db.add(app_state_rec)
                app_state_rec.state = {**(app_state_rec.state or {}), **app_state_delta}

            if user_state_delta:
                user_state_rec = db.query(ADKUserStateModel).filter(
                    ADKUserStateModel.app_name == app_name,
                    ADKUserStateModel.user_id == user_id,
                ).first()
                if not user_state_rec:
                    user_state_rec = ADKUserStateModel(app_name=app_name, user_id=user_id, state={})
                    db.add(user_state_rec)
                user_state_rec.state = {**(user_state_rec.state or {}), **user_state_delta}

            session_rec = ADKSessionModel(
                id=session_id,
                app_name=app_name,
                user_id=user_id,
                state=session_state or {},
                events=[],
                last_update_time=platform_time.get_time(),
            )
            db.add(session_rec)
            db.commit()

            session = Session(
                id=session_id,
                app_name=app_name,
                user_id=user_id,
                state=session_state or {},
                events=[],
                last_update_time=session_rec.last_update_time,
            )
            return self._merge_state(db, app_name, user_id, session)

    @override
    async def get_session(
        self,
        *,
        app_name: str,
        user_id: str,
        session_id: str,
        config: Optional[GetSessionConfig] = None,
    ) -> Optional[Session]:
        with self.session_factory() as db:
            session_rec = db.query(ADKSessionModel).filter(
                ADKSessionModel.app_name == app_name,
                ADKSessionModel.user_id == user_id,
                ADKSessionModel.id == session_id,
            ).first()
            if not session_rec:
                return None

            events_list = []
            if session_rec.events:
                for ev_data in session_rec.events:
                    events_list.append(Event.model_validate(ev_data))

            session = Session(
                id=session_rec.id,
                app_name=session_rec.app_name,
                user_id=session_rec.user_id,
                state=session_rec.state or {},
                events=events_list,
                last_update_time=session_rec.last_update_time or 0.0,
            )

            if config:
                if config.num_recent_events is not None:
                    if config.num_recent_events == 0:
                        session.events = []
                    else:
                        session.events = session.events[-config.num_recent_events:]
                if config.after_timestamp:
                    i = len(session.events) - 1
                    while i >= 0:
                        if session.events[i].timestamp < config.after_timestamp:
                            break
                        i -= 1
                    if i >= 0:
                        session.events = session.events[i + 1:]

            return self._merge_state(db, app_name, user_id, session)

    @override
    async def list_sessions(
        self, *, app_name: str, user_id: Optional[str] = None
    ) -> ListSessionsResponse:
        with self.session_factory() as db:
            query = db.query(ADKSessionModel).filter(ADKSessionModel.app_name == app_name)
            if user_id is not None:
                query = query.filter(ADKSessionModel.user_id == user_id)
            records = query.all()

            sessions_without_events = []
            for rec in records:
                session = Session(
                    id=rec.id,
                    app_name=rec.app_name,
                    user_id=rec.user_id,
                    state=rec.state or {},
                    events=[],
                    last_update_time=rec.last_update_time or 0.0,
                )
                session = self._merge_state(db, rec.app_name, rec.user_id, session)
                sessions_without_events.append(session)

            return ListSessionsResponse(sessions=sessions_without_events)

    @override
    async def delete_session(
        self, *, app_name: str, user_id: str, session_id: str
    ) -> None:
        with self.session_factory() as db:
            db.query(ADKSessionModel).filter(
                ADKSessionModel.app_name == app_name,
                ADKSessionModel.user_id == user_id,
                ADKSessionModel.id == session_id,
            ).delete()
            db.commit()

    @override
    async def append_event(self, session: Session, event: Event) -> Event:
        if event.partial:
            return event

        await super().append_event(session=session, event=event)
        session.last_update_time = event.timestamp

        app_name = session.app_name
        user_id = session.user_id
        session_id = session.id

        with self.session_factory() as db:
            session_rec = db.query(ADKSessionModel).filter(
                ADKSessionModel.app_name == app_name,
                ADKSessionModel.user_id == user_id,
                ADKSessionModel.id == session_id,
            ).first()
            if not session_rec:
                logger.warning(f"Failed to append event to session {session_id}: session not found in DB")
                return event

            serialized_event = event.model_dump(mode="json", by_alias=True)
            session_rec.events = (session_rec.events or []) + [serialized_event]
            session_rec.last_update_time = event.timestamp

            if event.actions.state_delta:
                state_deltas = _session_util.extract_state_delta(event.actions.state_delta)
                app_state_delta = state_deltas["app"]
                user_state_delta = state_deltas["user"]
                session_state_delta = state_deltas["session"]

                if app_state_delta:
                    app_state_rec = db.query(ADKAppStateModel).filter(
                        ADKAppStateModel.app_name == app_name
                    ).first()
                    if not app_state_rec:
                        app_state_rec = ADKAppStateModel(app_name=app_name, state={})
                        db.add(app_state_rec)
                    app_state_rec.state = {**(app_state_rec.state or {}), **app_state_delta}

                if user_state_delta:
                    user_state_rec = db.query(ADKUserStateModel).filter(
                        ADKUserStateModel.app_name == app_name,
                        ADKUserStateModel.user_id == user_id,
                    ).first()
                    if not user_state_rec:
                        user_state_rec = ADKUserStateModel(app_name=app_name, user_id=user_id, state={})
                        db.add(user_state_rec)
                    user_state_rec.state = {**(user_state_rec.state or {}), **user_state_delta}

                if session_state_delta:
                    session_rec.state = {**(session_rec.state or {}), **session_state_delta}

            db.commit()

        return event

    def _merge_state(
        self, db, app_name: str, user_id: str, copied_session: Session
    ) -> Session:
        # Merge app state
        app_state_rec = db.query(ADKAppStateModel).filter(
            ADKAppStateModel.app_name == app_name
        ).first()
        if app_state_rec and app_state_rec.state:
            for key, val in app_state_rec.state.items():
                copied_session.state[State.APP_PREFIX + key] = val

        # Merge user state
        user_state_rec = db.query(ADKUserStateModel).filter(
            ADKUserStateModel.app_name == app_name,
            ADKUserStateModel.user_id == user_id,
        ).first()
        if user_state_rec and user_state_rec.state:
            for key, val in user_state_rec.state.items():
                copied_session.state[State.USER_PREFIX + key] = val

        return copied_session

session_service = DatabaseSessionService()
