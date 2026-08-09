-- Full-text search indexes for the admin list searches.
--
-- Hand-written (drizzle-kit does not model virtual tables): these objects are
-- invisible to the schema snapshot, so they must be maintained here. See
-- lib/admin/search.ts for the query side and the rebuild/verify path.
--
-- tokenize='trigram' is deliberate: unlike the default tokenizer it matches
-- SUBSTRINGS, so "ossi" still finds "Rossi" exactly as the previous
-- `LIKE '%ossi%'` did. Search behaviour is unchanged; only the cost is.
-- Trigram needs >= 3 characters, so shorter terms fall back to LIKE in code.
--
-- content=<table> keeps only the index (no duplicated text). That links rows by
-- the content table's implicit rowid, which SQLite may renumber during VACUUM —
-- this codebase never VACUUMs, and the maintenance job additionally verifies
-- each index and rebuilds it if it ever drifts.

CREATE VIRTUAL TABLE orders_fts USING fts5(
	order_number, name, email,
	content='orders', content_rowid='rowid', tokenize='trigram'
);
--> statement-breakpoint
INSERT INTO orders_fts(rowid, order_number, name, email)
	SELECT rowid, coalesce(order_number,''), coalesce(name,''), coalesce(email,'') FROM orders;
--> statement-breakpoint
CREATE TRIGGER orders_fts_ai AFTER INSERT ON orders BEGIN
	INSERT INTO orders_fts(rowid, order_number, name, email)
	VALUES (new.rowid, coalesce(new.order_number,''), coalesce(new.name,''), coalesce(new.email,''));
END;
--> statement-breakpoint
CREATE TRIGGER orders_fts_ad AFTER DELETE ON orders BEGIN
	INSERT INTO orders_fts(orders_fts, rowid, order_number, name, email)
	VALUES ('delete', old.rowid, coalesce(old.order_number,''), coalesce(old.name,''), coalesce(old.email,''));
END;
--> statement-breakpoint
CREATE TRIGGER orders_fts_au AFTER UPDATE ON orders BEGIN
	INSERT INTO orders_fts(orders_fts, rowid, order_number, name, email)
	VALUES ('delete', old.rowid, coalesce(old.order_number,''), coalesce(old.name,''), coalesce(old.email,''));
	INSERT INTO orders_fts(rowid, order_number, name, email)
	VALUES (new.rowid, coalesce(new.order_number,''), coalesce(new.name,''), coalesce(new.email,''));
END;
--> statement-breakpoint
CREATE VIRTUAL TABLE reservations_fts USING fts5(
	reference, name, phone, email,
	content='reservations', content_rowid='rowid', tokenize='trigram'
);
--> statement-breakpoint
INSERT INTO reservations_fts(rowid, reference, name, phone, email)
	SELECT rowid, coalesce(reference,''), coalesce(name,''), coalesce(phone,''), coalesce(email,'') FROM reservations;
--> statement-breakpoint
CREATE TRIGGER reservations_fts_ai AFTER INSERT ON reservations BEGIN
	INSERT INTO reservations_fts(rowid, reference, name, phone, email)
	VALUES (new.rowid, coalesce(new.reference,''), coalesce(new.name,''), coalesce(new.phone,''), coalesce(new.email,''));
END;
--> statement-breakpoint
CREATE TRIGGER reservations_fts_ad AFTER DELETE ON reservations BEGIN
	INSERT INTO reservations_fts(reservations_fts, rowid, reference, name, phone, email)
	VALUES ('delete', old.rowid, coalesce(old.reference,''), coalesce(old.name,''), coalesce(old.phone,''), coalesce(old.email,''));
END;
--> statement-breakpoint
CREATE TRIGGER reservations_fts_au AFTER UPDATE ON reservations BEGIN
	INSERT INTO reservations_fts(reservations_fts, rowid, reference, name, phone, email)
	VALUES ('delete', old.rowid, coalesce(old.reference,''), coalesce(old.name,''), coalesce(old.phone,''), coalesce(old.email,''));
	INSERT INTO reservations_fts(rowid, reference, name, phone, email)
	VALUES (new.rowid, coalesce(new.reference,''), coalesce(new.name,''), coalesce(new.phone,''), coalesce(new.email,''));
END;
--> statement-breakpoint
CREATE VIRTUAL TABLE users_fts USING fts5(
	name, username, email, phone,
	content='users', content_rowid='rowid', tokenize='trigram'
);
--> statement-breakpoint
INSERT INTO users_fts(rowid, name, username, email, phone)
	SELECT rowid, coalesce(name,''), coalesce(username,''), coalesce(email,''), coalesce(phone,'') FROM users;
--> statement-breakpoint
CREATE TRIGGER users_fts_ai AFTER INSERT ON users BEGIN
	INSERT INTO users_fts(rowid, name, username, email, phone)
	VALUES (new.rowid, coalesce(new.name,''), coalesce(new.username,''), coalesce(new.email,''), coalesce(new.phone,''));
END;
--> statement-breakpoint
CREATE TRIGGER users_fts_ad AFTER DELETE ON users BEGIN
	INSERT INTO users_fts(users_fts, rowid, name, username, email, phone)
	VALUES ('delete', old.rowid, coalesce(old.name,''), coalesce(old.username,''), coalesce(old.email,''), coalesce(old.phone,''));
END;
--> statement-breakpoint
CREATE TRIGGER users_fts_au AFTER UPDATE ON users BEGIN
	INSERT INTO users_fts(users_fts, rowid, name, username, email, phone)
	VALUES ('delete', old.rowid, coalesce(old.name,''), coalesce(old.username,''), coalesce(old.email,''), coalesce(old.phone,''));
	INSERT INTO users_fts(rowid, name, username, email, phone)
	VALUES (new.rowid, coalesce(new.name,''), coalesce(new.username,''), coalesce(new.email,''), coalesce(new.phone,''));
END;
--> statement-breakpoint
CREATE VIRTUAL TABLE newsletter_subscribers_fts USING fts5(
	email,
	content='newsletter_subscribers', content_rowid='rowid', tokenize='trigram'
);
--> statement-breakpoint
INSERT INTO newsletter_subscribers_fts(rowid, email)
	SELECT rowid, coalesce(email,'') FROM newsletter_subscribers;
--> statement-breakpoint
CREATE TRIGGER newsletter_subscribers_fts_ai AFTER INSERT ON newsletter_subscribers BEGIN
	INSERT INTO newsletter_subscribers_fts(rowid, email) VALUES (new.rowid, coalesce(new.email,''));
END;
--> statement-breakpoint
CREATE TRIGGER newsletter_subscribers_fts_ad AFTER DELETE ON newsletter_subscribers BEGIN
	INSERT INTO newsletter_subscribers_fts(newsletter_subscribers_fts, rowid, email)
	VALUES ('delete', old.rowid, coalesce(old.email,''));
END;
--> statement-breakpoint
CREATE TRIGGER newsletter_subscribers_fts_au AFTER UPDATE ON newsletter_subscribers BEGIN
	INSERT INTO newsletter_subscribers_fts(newsletter_subscribers_fts, rowid, email)
	VALUES ('delete', old.rowid, coalesce(old.email,''));
	INSERT INTO newsletter_subscribers_fts(rowid, email) VALUES (new.rowid, coalesce(new.email,''));
END;
--> statement-breakpoint
CREATE VIRTUAL TABLE audit_log_fts USING fts5(
	summary, action, entity_id,
	content='audit_log', content_rowid='rowid', tokenize='trigram'
);
--> statement-breakpoint
INSERT INTO audit_log_fts(rowid, summary, action, entity_id)
	SELECT rowid, coalesce(summary,''), coalesce(action,''), coalesce(entity_id,'') FROM audit_log;
--> statement-breakpoint
CREATE TRIGGER audit_log_fts_ai AFTER INSERT ON audit_log BEGIN
	INSERT INTO audit_log_fts(rowid, summary, action, entity_id)
	VALUES (new.rowid, coalesce(new.summary,''), coalesce(new.action,''), coalesce(new.entity_id,''));
END;
--> statement-breakpoint
CREATE TRIGGER audit_log_fts_ad AFTER DELETE ON audit_log BEGIN
	INSERT INTO audit_log_fts(audit_log_fts, rowid, summary, action, entity_id)
	VALUES ('delete', old.rowid, coalesce(old.summary,''), coalesce(old.action,''), coalesce(old.entity_id,''));
END;
--> statement-breakpoint
CREATE TRIGGER audit_log_fts_au AFTER UPDATE ON audit_log BEGIN
	INSERT INTO audit_log_fts(audit_log_fts, rowid, summary, action, entity_id)
	VALUES ('delete', old.rowid, coalesce(old.summary,''), coalesce(old.action,''), coalesce(old.entity_id,''));
	INSERT INTO audit_log_fts(rowid, summary, action, entity_id)
	VALUES (new.rowid, coalesce(new.summary,''), coalesce(new.action,''), coalesce(new.entity_id,''));
END;
