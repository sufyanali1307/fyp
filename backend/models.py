from datetime import datetime, timezone
from flask_sqlalchemy import SQLAlchemy


db = SQLAlchemy()


class Environment(db.Model):
    __tablename__ = 'environments'
    id = db.Column(db.String(50), primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    type = db.Column(db.String(50), nullable=False)  # node, python, react, docker, ml
    source = db.Column(db.String(50), nullable=False) # files, github, template, ml
    status = db.Column(db.String(20), default='created') # created, building, deploying, running, stopped, failed, expired
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    deployed_at = db.Column(db.DateTime, nullable=True)
    expires_at = db.Column(db.DateTime, nullable=True)
   
    # Docker specific
    container_id = db.Column(db.String(100), nullable=True)
    port = db.Column(db.Integer, nullable=True)
    url = db.Column(db.String(255), nullable=True)
    target_dir = db.Column(db.String(255), nullable=True) # Where files are stored locally
   
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'type': self.type,
            'source': self.source,
            'status': self.status,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'deployedAt': self.deployed_at.isoformat() if self.deployed_at else None,
            'expiresAt': self.expires_at.isoformat() if self.expires_at else None,
            'containerId': self.container_id,
            'port': self.port,
            'url': self.url
        }


