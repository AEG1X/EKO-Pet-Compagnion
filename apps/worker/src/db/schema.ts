import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
      enum: [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic',
        'image/gif',
        'video/mp4',
        'video/quicktime',
        'video/webm',
      ],
    }).notNull(),
    size: integer('size').notNull(),
    /** Nom d'origine, affiché au téléchargement. */
    name: text('name'),
    purpose: text('purpose', { enum: ['pending', 'document', 'photo', 'memory', 'preview'] }).notNull(),
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
  /** Liste JSON des sections masquées du tableau de bord. */
  hiddenSections: text('hidden_sections').notNull().default('[]'),
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

export const reminder = sqliteTable(
  'reminder',
  {
    id: text('id').primaryKey(),
    dogId: text('dog_id')
      .notNull()
      .references(() => dog.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    kind: text('kind', {
      enum: ['rendez_vous', 'sante', 'toilettage', 'education', 'administratif', 'autre'],
    }).notNull(),
    /** Prochaine occurrence, AAAA-MM-JJ. Un rappel récurrent avance à l'occurrence suivante quand il est fait. */
    date: text('date').notNull(),
    /** Heure locale HH:MM (Europe/Paris), ou null pour toute la journée. */
    time: text('time'),
    recurrence: text('recurrence', { enum: ['none', 'daily', 'weekly', 'monthly', 'yearly'] }).notNull(),
    notifyDaysBefore: integer('notify_days_before').notNull().default(1),
    healthEventId: text('health_event_id').references(() => healthEvent.id, { onDelete: 'set null' }),
    notes: text('notes'),
    /** Rappel ponctuel fait : date à laquelle il a été coché. */
    doneDate: text('done_date'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('reminder_dog_date_idx').on(t.dogId, t.date)],
);

/** Lien d'abonnement au calendrier (Apple Calendrier, Google Agenda) : un seul par propriétaire, révocable. */
export const calendarFeed = sqliteTable('calendar_feed', {
  ownerId: text('owner_id')
    .primaryKey()
    .references(() => owner.id, { onDelete: 'cascade' }),
  /** SHA-256 du jeton : le jeton lui-même n'apparaît que dans l'adresse donnée une fois au propriétaire. */
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: integer('created_at').notNull(),
  lastUsedAt: integer('last_used_at'),
});

/** Appareils abonnés aux notifications Web Push. */
export const pushSubscription = sqliteTable(
  'push_subscription',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => owner.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    label: text('label').notNull(),
    createdAt: integer('created_at').notNull(),
    lastSuccessAt: integer('last_success_at'),
  },
  (t) => [index('push_subscription_owner_idx').on(t.ownerId)],
);

/** Conversation Telegram liée (canal de secours), ou code de liaison en attente. */
export const telegramLink = sqliteTable('telegram_link', {
  ownerId: text('owner_id')
    .primaryKey()
    .references(() => owner.id, { onDelete: 'cascade' }),
  chatId: text('chat_id'),
  linkCode: text('link_code'),
  linkCodeExpiresAt: integer('link_code_expires_at'),
  linkedAt: integer('linked_at'),
});

/** Récapitulatifs quotidiens déjà envoyés : un seul par jour, même si la tâche planifiée se répète. */
export const notificationRun = sqliteTable(
  'notification_run',
  {
    ownerId: text('owner_id')
      .notNull()
      .references(() => owner.id, { onDelete: 'cascade' }),
    day: text('day').notNull(),
    sentAt: integer('sent_at').notNull(),
    /** Canaux effectivement utilisés, ex. « push:2 telegram ». */
    summary: text('summary').notNull(),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.day] })],
);

// ---------- Médaille (phase C) ----------

/**
 * Médaille NFC / QR du chien. public_id est l'identifiant aléatoire de l'adresse publique :
 * null quand la médaille est désactivée. Le remplacer rend l'ancienne médaille inopérante.
 */
export const medal = sqliteTable('medal', {
  dogId: text('dog_id')
    .primaryKey()
    .references(() => dog.id, { onDelete: 'cascade' }),
  publicId: text('public_id').unique(),
  /** Réglages d'affichage de la fiche publique (JSON, voir medalSettingsSchema). */
  settings: text('settings').notNull(),
  /** Empreinte du dernier instantané écrit dans R2 (fiche de secours si D1 est indisponible). */
  snapshotHash: text('snapshot_hash'),
  createdAt: integer('created_at'),
  lastScanAt: integer('last_scan_at'),
  scanCount: integer('scan_count').notNull().default(0),
  updatedAt: integer('updated_at').notNull(),
});

/** Épisodes « perdu » : un seul en cours à la fois (ended_at null). */
export const lostEpisode = sqliteTable(
  'lost_episode',
  {
    id: text('id').primaryKey(),
    dogId: text('dog_id')
      .notNull()
      .references(() => dog.id, { onDelete: 'cascade' }),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
    message: text('message'),
    /** Nombre de signalements reçus, conservé après la purge. */
    reportCount: integer('report_count').notNull().default(0),
    /** Signalements effacés (30 jours après la fin) : il ne reste que ce résumé. */
    purgedAt: integer('purged_at'),
    /** Dernière alerte « fiche consultée », pour ne pas en envoyer à chaque visite. */
    lastScanAlertAt: integer('last_scan_alert_at'),
  },
  (t) => [index('lost_episode_dog_idx').on(t.dogId, t.startedAt)],
);

/** Signalement d'une personne qui a vu ou trouvé le chien. Données personnelles : purgées avec l'épisode. */
export const finderReport = sqliteTable(
  'finder_report',
  {
    id: text('id').primaryKey(),
    episodeId: text('episode_id')
      .notNull()
      .references(() => lostEpisode.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull(),
    message: text('message'),
    contact: text('contact'),
    latitude: real('latitude'),
    longitude: real('longitude'),
    accuracy: real('accuracy'),
  },
  (t) => [index('finder_report_episode_idx').on(t.episodeId, t.createdAt)],
);

// ---------- Souvenirs (phase B) ----------

/** Photo ou vidéo : l'original n'est jamais modifié ; l'aperçu est un fichier à part. */
export const memory = sqliteTable(
  'memory',
  {
    id: text('id').primaryKey(),
    dogId: text('dog_id')
      .notNull()
      .references(() => dog.id, { onDelete: 'cascade' }),
    fileId: text('file_id')
      .notNull()
      .unique()
      .references(() => storedFile.id),
    previewFileId: text('preview_file_id').references(() => storedFile.id, { onDelete: 'set null' }),
    /** SHA-256 de l'original : un même fichier n'est importé qu'une fois. */
    contentHash: text('content_hash').notNull(),
    kind: text('kind', { enum: ['photo', 'video'] }).notNull(),
    /** Date AAAA-MM-JJ du souvenir (classement année / mois) et heure facultative. */
    takenDate: text('taken_date').notNull(),
    takenTime: text('taken_time'),
    dateSource: text('date_source', { enum: ['exif', 'video', 'file', 'manual'] }).notNull(),
    caption: text('caption'),
    favorite: integer('favorite', { mode: 'boolean' }).notNull().default(false),
    width: integer('width'),
    height: integer('height'),
    durationSeconds: integer('duration_seconds'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('memory_dog_date_idx').on(t.dogId, t.takenDate),
    uniqueIndex('memory_dog_hash_idx').on(t.dogId, t.contentHash),
  ],
);
