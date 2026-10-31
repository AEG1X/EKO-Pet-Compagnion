import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Horodatages en millisecondes depuis l'époque Unix (UTC).
 * Aucun secret n'est stocké en clair : jetons de session, codes de secours et PIN sont hachés.
 */

export const owner = sqliteTable('owner', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  /** Identifiant WebAuthn opaque de l'utilisateur (base64url). */
  webauthnUserId: text('webauthn_user_id').notNull(),
  createdAt: integer('created_at').notNull(),
});

/**
 * Fichier stocké dans R2 (clé = files/<propriétaire>/<id>). Les tailles servent aux plafonds
 * applicatifs du stockage. « pending » : envoyé mais pas encore rattaché (purgé après 24 h).
 */
export const storedFile = sqliteTable(
  'stored_file',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => owner.id, { onDelete: 'cascade' }),
    r2Key: text('r2_key').notNull(),
    contentType: text('content_type', {
      enum: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    }).notNull(),
    size: integer('size').notNull(),
    /** Nom d'origine, affiché au téléchargement. */
    name: text('name'),
    purpose: text('purpose', { enum: ['pending', 'document', 'photo'] }).notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('stored_file_owner_idx').on(t.ownerId, t.purpose)],
);

export const passkey = sqliteTable(
  'passkey',
  {
    /** Identifiant de la clé d'accès (base64url), fourni par l'authentificateur. */
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => owner.id, { onDelete: 'cascade' }),
    publicKey: text('public_key').notNull(),
    counter: integer('counter').notNull().default(0),
    transports: text('transports'),
    deviceType: text('device_type').notNull(),
    backedUp: integer('backed_up', { mode: 'boolean' }).notNull(),
    label: text('label').notNull(),
    createdAt: integer('created_at').notNull(),
    lastUsedAt: integer('last_used_at'),
  },
  (t) => [index('passkey_owner_idx').on(t.ownerId)],
);

export const session = sqliteTable(
  'session',
  {
    /** SHA-256 du jeton de session ; le jeton lui-même ne vit que dans le cookie. */
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => owner.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['full', 'recovery'] }).notNull(),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    lastSeenAt: integer('last_seen_at').notNull(),
    /** Null = verrouillée : le PIN (ou une passkey) est requis. */
    unlockedAt: integer('unlocked_at'),
    userAgent: text('user_agent'),
  },
  (t) => [index('session_owner_idx').on(t.ownerId), index('session_expires_idx').on(t.expiresAt)],
);

export const recoveryCode = sqliteTable(
  'recovery_code',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => owner.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull().unique(),
    createdAt: integer('created_at').notNull(),
    usedAt: integer('used_at'),
  },
  (t) => [index('recovery_owner_idx').on(t.ownerId)],
);

export const pin = sqliteTable('pin', {
  ownerId: text('owner_id')
    .primaryKey()
    .references(() => owner.id, { onDelete: 'cascade' }),
  hash: text('hash').notNull(),
  salt: text('salt').notNull(),
  /** Erreurs consécutives depuis le dernier succès. */
  failedCount: integer('failed_count').notNull().default(0),
  lockedUntil: integer('locked_until'),
  updatedAt: integer('updated_at').notNull(),
});

export const settings = sqliteTable('settings', {
  ownerId: text('owner_id')
    .primaryKey()
    .references(() => owner.id, { onDelete: 'cascade' }),
  theme: text('theme').notNull(),
  accent: text('accent').notNull(),
  sectionOrder: text('section_order').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const authChallenge = sqliteTable('auth_challenge', {
  id: text('id').primaryKey(),
  purpose: text('purpose', { enum: ['setup', 'login', 'add_passkey'] }).notNull(),
  challenge: text('challenge').notNull(),
  ownerId: text('owner_id'),
  /** Données propres à l'étape (JSON), par exemple le nom saisi lors de la configuration. */
  payload: text('payload'),
  expiresAt: integer('expires_at').notNull(),
});

export const rateLimit = sqliteTable('rate_limit', {
  key: text('key').primaryKey(),
  windowStart: integer('window_start').notNull(),
  count: integer('count').notNull(),
});

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    at: integer('at').notNull(),
    event: text('event').notNull(),
    /** Détail non sensible uniquement (jamais de jeton, de PIN ni d'adresse IP). */
    detail: text('detail'),
  },
  (t) => [index('audit_at_idx').on(t.at)],
);

// ---------- Vie d'Eko (phase A2) ----------
// Toutes les tables métier portent un dog_id : un seul chien aujourd'hui, un second sans migration lourde.

export const dog = sqliteTable(
  'dog',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => owner.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    breed: text('breed'),
    sex: text('sex', { enum: ['male', 'femelle'] }),
    /** Date calendaire AAAA-MM-JJ. */
    birthDate: text('birth_date'),
    neutered: integer('neutered', { mode: 'boolean' }),
    coat: text('coat'),
    /** Données privées : jamais exposées publiquement. */
    chipNumber: text('chip_number'),
    passportNumber: text('passport_number'),
    address: text('address'),
    area: text('area'),
    notes: text('notes'),
    photoFileId: text('photo_file_id').references(() => storedFile.id, { onDelete: 'set null' }),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('dog_owner_idx').on(t.ownerId)],
);

export const contact = sqliteTable(
  'contact',
  {
    id: text('id').primaryKey(),
    dogId: text('dog_id')
      .notNull()
      .references(() => dog.id, { onDelete: 'cascade' }),
    kind: text('kind', {
      enum: ['veterinaire', 'urgences', 'toiletteur', 'pension', 'educateur', 'eleveur', 'autre'],
    }).notNull(),
    name: text('name').notNull(),
    organization: text('organization'),
    phone: text('phone'),
    email: text('email'),
    address: text('address'),
    notes: text('notes'),
    primary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('contact_dog_idx').on(t.dogId)],
);

export const healthEvent = sqliteTable(
  'health_event',
  {
    id: text('id').primaryKey(),
    dogId: text('dog_id')
      .notNull()
      .references(() => dog.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['vaccin', 'antiparasitaire', 'consultation', 'symptome', 'soin'] }).notNull(),
    date: text('date').notNull(),
    title: text('title').notNull(),
    /** Vétérinaire ou autre contact ; conservé à null si le contact est supprimé. */
    contactId: text('contact_id').references(() => contact.id, { onDelete: 'set null' }),
    /** Prochaine échéance AAAA-MM-JJ : alimentera les rappels (étape 5). */
    nextDueDate: text('next_due_date'),
    notes: text('notes'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('health_event_dog_date_idx').on(t.dogId, t.date), index('health_event_due_idx').on(t.dogId, t.nextDueDate)],
);

export const treatment = sqliteTable(
  'treatment',
  {
    id: text('id').primaryKey(),
    dogId: text('dog_id')
      .notNull()
      .references(() => dog.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    dosage: text('dosage'),
    frequency: text('frequency'),
    startDate: text('start_date').notNull(),
    endDate: text('end_date'),
    notes: text('notes'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('treatment_dog_idx').on(t.dogId, t.startDate)],
);

export const weightEntry = sqliteTable(
  'weight_entry',
  {
    id: text('id').primaryKey(),
    dogId: text('dog_id')
      .notNull()
      .references(() => dog.id, { onDelete: 'cascade' }),
    /** Une pesée par jour : en saisir une seconde remplace la première. */
    date: text('date').notNull(),
    grams: integer('grams').notNull(),
    notes: text('notes'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('weight_dog_date_idx').on(t.dogId, t.date)],
);

export const feedingPlan = sqliteTable(
  'feeding_plan',
  {
    id: text('id').primaryKey(),
    dogId: text('dog_id')
      .notNull()
      .references(() => dog.id, { onDelete: 'cascade' }),
    food: text('food').notNull(),
    dailyGrams: integer('daily_grams'),
    mealsPerDay: integer('meals_per_day'),
    startDate: text('start_date').notNull(),
    /** Null = alimentation actuelle. */
    endDate: text('end_date'),
    notes: text('notes'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('feeding_plan_dog_idx').on(t.dogId, t.startDate)],
);

export const trainingSkill = sqliteTable(
  'training_skill',
  {
    id: text('id').primaryKey(),
    dogId: text('dog_id')
      .notNull()
      .references(() => dog.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    status: text('status', { enum: ['a_apprendre', 'en_cours', 'acquis'] }).notNull(),
    acquiredDate: text('acquired_date'),
    notes: text('notes'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('training_skill_dog_idx').on(t.dogId)],
);

export const trainingSession = sqliteTable(
  'training_session',
  {
    id: text('id').primaryKey(),
    dogId: text('dog_id')
      .notNull()
      .references(() => dog.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    durationMinutes: integer('duration_minutes'),
    skillId: text('skill_id').references(() => trainingSkill.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('training_session_dog_idx').on(t.dogId, t.date)],
);

export const expense = sqliteTable(
  'expense',
  {
    id: text('id').primaryKey(),
    dogId: text('dog_id')
      .notNull()
      .references(() => dog.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    /** Montant en centimes d'euro. */
    amountCents: integer('amount_cents').notNull(),
    category: text('category', {
      enum: ['sante', 'alimentation', 'toilettage', 'education', 'equipement', 'assurance', 'garde', 'autre'],
    }).notNull(),
    label: text('label').notNull(),
    healthEventId: text('health_event_id').references(() => healthEvent.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('expense_dog_date_idx').on(t.dogId, t.date)],
);

export const document = sqliteTable(
  'document',
  {
    id: text('id').primaryKey(),
    dogId: text('dog_id')
      .notNull()
      .references(() => dog.id, { onDelete: 'cascade' }),
    /** Le fichier est supprimé de R2 par la route qui supprime le document. */
    fileId: text('file_id')
      .notNull()
      .references(() => storedFile.id),
    category: text('category', {
      enum: ['ordonnance', 'analyse', 'compte_rendu', 'facture', 'assurance', 'identification', 'certificat', 'autre'],
    }).notNull(),
    title: text('title').notNull(),
    date: text('date').notNull(),
    healthEventId: text('health_event_id').references(() => healthEvent.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('document_dog_date_idx').on(t.dogId, t.date), uniqueIndex('document_file_idx').on(t.fileId)],
);
