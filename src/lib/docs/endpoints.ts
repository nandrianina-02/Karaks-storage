import type { Permission } from '@/lib/security/permissions'

/**
 * Catalogue des points d'entrée de l'API v1 (CDS 6.5).
 *
 * Décrit une seule fois, il alimente la page de documentation et le
 * document OpenAPI : les deux ne peuvent pas se contredire.
 */
export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface Endpoint {
  id: string
  method: Method
  path: string
  title: string
  description: string
  permission?: Permission
  /** Paramètres de chemin ou de requête. */
  params?: { name: string; in: 'path' | 'query' | 'header'; description: string; required?: boolean }[]
  body?: { type: 'json' | 'multipart' | 'binary'; example?: unknown; fields?: { name: string; description: string; required?: boolean }[] }
  headers?: Record<string, string>
  response: { status: number; example: unknown }
}

export interface Section {
  id: string
  title: string
  intro: string
  endpoints: Endpoint[]
}

const FILE = {
  id: 'file_92kdLq0aZt7x',
  name: 'song.mp3',
  extension: 'mp3',
  mimeType: 'audio/mpeg',
  category: 'audio',
  size: 8452312,
  checksum: '9e107d9d372bb6826bd81d3542a419d6',
  folderId: 'fld_Pq8sYw2mNc4r',
  status: 'active',
  durationSeconds: 232,
  width: null,
  height: null,
  waveform: [12, 40, 73, 58, 91, 66],
  streams: 1284,
  downloads: 37,
  createdAt: '2026-10-06T10:24:00.000Z',
  updatedAt: '2026-10-06T10:24:00.000Z',
}

export const SECTIONS: Section[] = [
  {
    id: 'fichiers',
    title: 'Fichiers',
    intro: 'Lister, consulter, renommer, déplacer et supprimer les fichiers du projet. La suppression passe d’abord par la corbeille.',
    endpoints: [
      {
        id: 'list-files',
        method: 'GET',
        path: '/api/v1/files',
        title: 'Lister les fichiers',
        description: 'Recherche et pagination. Par défaut, les fichiers actifs, les plus récemment modifiés d’abord.',
        permission: 'files:read',
        params: [
          { name: 'search', in: 'query', description: 'Partie du nom, sans tenir compte de la casse.' },
          { name: 'folderId', in: 'query', description: 'Fichiers d’un dossier. folder=root : hors dossier.' },
          { name: 'category', in: 'query', description: 'audio, image, video ou document.' },
          { name: 'status', in: 'query', description: 'active (défaut), trashed ou all.' },
          { name: 'minSize, maxSize', in: 'query', description: 'Taille en octets.' },
          { name: 'from, to', in: 'query', description: 'Dates de création, au format ISO 8601.' },
          { name: 'sort, order', in: 'query', description: 'name, size, createdAt, updatedAt, type ; asc ou desc.' },
          { name: 'page, limit', in: 'query', description: 'Page à partir de 1 ; 50 par défaut, 200 au plus.' },
        ],
        response: { status: 200, example: { success: true, files: [FILE], pagination: { page: 1, limit: 50, total: 1, pages: 1 } } },
      },
      {
        id: 'get-file',
        method: 'GET',
        path: '/api/v1/files/{id}',
        title: 'Consulter un fichier',
        description: 'Métadonnées d’un fichier actif ou à la corbeille. L’identifiant du fournisseur de stockage n’est jamais renvoyé.',
        permission: 'files:read',
        params: [{ name: 'id', in: 'path', description: 'Identifiant du fichier (file_…).', required: true }],
        response: { status: 200, example: { success: true, file: FILE } },
      },
      {
        id: 'update-file',
        method: 'PATCH',
        path: '/api/v1/files/{id}',
        title: 'Renommer ou déplacer',
        description: 'Le nouveau nom garde l’extension d’origine. folderId à null déplace à la racine du projet.',
        permission: 'files:update',
        params: [{ name: 'id', in: 'path', description: 'Identifiant du fichier.', required: true }],
        body: { type: 'json', example: { name: 'papaoutai.mp3', folderId: 'fld_Pq8sYw2mNc4r' } },
        response: { status: 200, example: { success: true, file: { ...FILE, name: 'papaoutai.mp3' } } },
      },
      {
        id: 'trash-file',
        method: 'DELETE',
        path: '/api/v1/files/{id}',
        title: 'Mettre à la corbeille',
        description: 'Le fichier n’est plus diffusé ; il reste restaurable.',
        permission: 'files:delete',
        params: [{ name: 'id', in: 'path', description: 'Identifiant du fichier.', required: true }],
        response: { status: 200, example: { success: true, file: { ...FILE, status: 'trashed', trashedAt: '2026-10-06T12:00:00.000Z' } } },
      },
      {
        id: 'restore-file',
        method: 'POST',
        path: '/api/v1/files/{id}/restore',
        title: 'Restaurer',
        description: 'Ramène un fichier de la corbeille dans son dossier d’origine.',
        permission: 'files:delete',
        params: [{ name: 'id', in: 'path', description: 'Identifiant du fichier.', required: true }],
        response: { status: 200, example: { success: true, file: FILE } },
      },
      {
        id: 'destroy-file',
        method: 'DELETE',
        path: '/api/v1/files/{id}/permanent',
        title: 'Supprimer définitivement',
        description: 'Efface le fichier du stockage. Ses liens temporaires cessent de fonctionner. Irréversible.',
        permission: 'files:delete',
        params: [{ name: 'id', in: 'path', description: 'Identifiant du fichier.', required: true }],
        response: { status: 200, example: { success: true } },
      },
    ],
  },
  {
    id: 'televersement',
    title: 'Téléversement',
    intro:
      'Envoi simple pour les petits fichiers (4 Mo), envoi reprenable au-delà ou sur un réseau instable. Le contenu réel du fichier est vérifié : un fichier dont les octets ne correspondent pas à l’extension est refusé (415).',
    endpoints: [
      {
        id: 'upload',
        method: 'POST',
        path: '/api/v1/files/upload',
        title: 'Envoi simple',
        description: 'Corps multipart/form-data, 4 Mo au plus ; au-delà, utilisez l’envoi reprenable.',
        permission: 'files:upload',
        body: {
          type: 'multipart',
          fields: [
            { name: 'file', description: 'Le fichier.', required: true },
            { name: 'folderId', description: 'Dossier de destination.' },
            { name: 'name', description: 'Nom à enregistrer, à la place de celui du fichier.' },
            { name: 'durationSeconds, width, height', description: 'Métadonnées média, si le client les connaît.' },
            { name: 'waveform', description: 'Crêtes du signal (0 à 100), séparées par des virgules.' },
          ],
        },
        response: { status: 201, example: { success: true, file: FILE } },
      },
      {
        id: 'upload-session',
        method: 'POST',
        path: '/api/v1/uploads',
        title: 'Ouvrir un envoi reprenable',
        description:
          'Renvoie l’identifiant de session, la taille des morceaux et uploadUrl. Les morceaux, sauf le dernier, doivent être des multiples de chunkGranularity. uploadUrl est une adresse à jeton propre à la session : le serveur de votre application la remet au navigateur, qui y envoie les morceaux (PUT avec Content-Range) sans détenir de clé API. Les origines autorisées du projet s’appliquent (CORS).',
        permission: 'files:upload',
        body: { type: 'json', example: { name: 'song.mp3', mimeType: 'audio/mpeg', size: 52428800, folderId: 'fld_Pq8sYw2mNc4r', durationSeconds: 232 } },
        response: {
          status: 201,
          example: {
            success: true,
            upload: { id: 'upl_Hs7dK2pQm9xA', fileId: 'file_92kdLq0aZt7x', name: 'song.mp3', size: 52428800, received: 0, status: 'pending', expiresAt: '2026-10-12T10:00:00.000Z' },
            uploadUrl: 'https://storage.karaks.com/u/upl_Hs7dK2pQm9xA?t=…',
            chunkSize: 4194304,
            chunkGranularity: 262144,
          },
        },
      },
      {
        id: 'upload-chunk',
        method: 'PUT',
        path: '/api/v1/uploads/{id}',
        title: 'Envoyer un morceau',
        description:
          '202 tant que l’envoi n’est pas complet, 200 avec le fichier à la fin. Si received ne vaut pas la fin du morceau envoyé, reprenez à cette position.',
        permission: 'files:upload',
        params: [{ name: 'id', in: 'path', description: 'Identifiant de session (upl_…).', required: true }],
        headers: { 'Content-Range': 'bytes 0-4194303/52428800' },
        body: { type: 'binary' },
        response: { status: 202, example: { success: true, upload: { id: 'upl_Hs7dK2pQm9xA', received: 4194304, status: 'pending' }, file: null } },
      },
      {
        id: 'upload-status',
        method: 'GET',
        path: '/api/v1/uploads/{id}',
        title: 'Reprendre après une coupure',
        description: 'Indique les octets réellement conservés : c’est de là que le client reprend.',
        permission: 'files:upload',
        params: [{ name: 'id', in: 'path', description: 'Identifiant de session.', required: true }],
        response: { status: 200, example: { success: true, upload: { id: 'upl_Hs7dK2pQm9xA', received: 16777216, status: 'pending' }, file: null } },
      },
      {
        id: 'upload-abort',
        method: 'DELETE',
        path: '/api/v1/uploads/{id}',
        title: 'Abandonner un envoi',
        description: 'Libère la session chez le fournisseur.',
        permission: 'files:upload',
        params: [{ name: 'id', in: 'path', description: 'Identifiant de session.', required: true }],
        response: { status: 200, example: { success: true } },
      },
    ],
  },
  {
    id: 'diffusion',
    title: 'Diffusion',
    intro:
      'Lecture continue et téléchargement, avec les requêtes de plage (Range) qui permettent au lecteur d’avancer dans un titre. Réponse 206 pour une plage, 416 si elle sort du fichier.',
    endpoints: [
      {
        id: 'stream',
        method: 'GET',
        path: '/api/v1/files/{id}/stream',
        title: 'Lecture continue',
        description: 'Pour un lecteur côté serveur. Dans un navigateur ou une application mobile, utilisez un lien temporaire : la clé API ne doit pas y figurer.',
        permission: 'stream:read',
        params: [{ name: 'id', in: 'path', description: 'Identifiant du fichier.', required: true }],
        headers: { Range: 'bytes=0-999999' },
        response: { status: 206, example: '<octets du fichier>' },
      },
      {
        id: 'download',
        method: 'GET',
        path: '/api/v1/files/{id}/download',
        title: 'Téléchargement',
        description: 'Même flux, avec Content-Disposition: attachment et le nom d’origine.',
        permission: 'download:read',
        params: [{ name: 'id', in: 'path', description: 'Identifiant du fichier.', required: true }],
        response: { status: 200, example: '<octets du fichier>' },
      },
    ],
  },
  {
    id: 'liens',
    title: 'Liens temporaires',
    intro:
      'Une adresse publique, limitée dans le temps et en nombre d’utilisations, révocable. C’est ce que le serveur de Karaks remet au lecteur web ou Android. Seule l’empreinte du jeton est conservée.',
    endpoints: [
      {
        id: 'signed-url',
        method: 'POST',
        path: '/api/v1/files/{id}/signed-url',
        title: 'Créer un lien',
        description:
          'type : stream ou download. expiresIn : de 30 secondes à 7 jours. maxUses : facultatif ; une utilisation est comptée à l’ouverture, les requêtes de plage de la même lecture ne la recomptent pas. Sur un stockage S3 en diffusion directe, le lien répond 302 vers une adresse signée du fournisseur : un lecteur suit la redirection de lui-même.',
        permission: 'links:create',
        params: [{ name: 'id', in: 'path', description: 'Identifiant du fichier.', required: true }],
        body: { type: 'json', example: { type: 'stream', expiresIn: 600, maxUses: 1 } },
        response: { status: 201, example: { success: true, url: 'https://storage.karaks.com/s/Ab82Kx9Qm2pLz7Rt5Vn0wYc3', expiresAt: '2026-10-06T12:10:00.000Z' } },
      },
      {
        id: 'list-links',
        method: 'GET',
        path: '/api/v1/links',
        title: 'Lister les liens',
        description: 'Filtre status : active, expired, exhausted, revoked ou all.',
        permission: 'files:read',
        params: [{ name: 'status', in: 'query', description: 'Statut des liens.' }],
        response: { status: 200, example: { success: true, links: [{ id: 'cm1x…', hint: 'Ab82', type: 'stream', status: 'active', fileId: FILE.id, uses: 0, maxUses: 1 }] } },
      },
      {
        id: 'revoke-link',
        method: 'DELETE',
        path: '/api/v1/links/{id}',
        title: 'Révoquer un lien',
        description: 'Effet immédiat : la requête suivante sur ce lien reçoit 410.',
        permission: 'links:revoke',
        params: [{ name: 'id', in: 'path', description: 'Identifiant du lien.', required: true }],
        response: { status: 200, example: { success: true, link: { status: 'revoked' } } },
      },
    ],
  },
  {
    id: 'dossiers',
    title: 'Dossiers',
    intro: 'L’arborescence du projet, reproduite chez le fournisseur de stockage.',
    endpoints: [
      {
        id: 'list-folders',
        method: 'GET',
        path: '/api/v1/folders',
        title: 'Lister les dossiers',
        description: 'Sous-dossiers d’un dossier (racine par défaut), avec le chemin depuis la racine.',
        permission: 'folders:read',
        params: [{ name: 'parentId', in: 'query', description: 'Dossier parent.' }],
        response: { status: 200, example: { success: true, folders: [{ id: 'fld_Pq8sYw2mNc4r', name: 'audio', parentId: null, files: 42, folders: 0 }], path: [] } },
      },
      {
        id: 'create-folder',
        method: 'POST',
        path: '/api/v1/folders',
        title: 'Créer un dossier',
        description: 'Le nom doit être unique dans son dossier parent (409 sinon).',
        permission: 'folders:write',
        body: { type: 'json', example: { name: 'covers', parentId: null } },
        response: { status: 201, example: { success: true, folder: { id: 'fld_Xt3kP9qLm2vB', name: 'covers', parentId: null } } },
      },
      {
        id: 'delete-folder',
        method: 'DELETE',
        path: '/api/v1/folders/{id}',
        title: 'Supprimer un dossier vide',
        description: 'Refusé (409) tant que le dossier contient des fichiers, même à la corbeille, ou des sous-dossiers.',
        permission: 'folders:write',
        params: [{ name: 'id', in: 'path', description: 'Identifiant du dossier.', required: true }],
        response: { status: 200, example: { success: true } },
      },
    ],
  },
  {
    id: 'projet',
    title: 'Projet et suivi',
    intro: 'Statistiques, journal d’audit et webhooks du projet.',
    endpoints: [
      {
        id: 'stats',
        method: 'GET',
        path: '/api/v1/stats',
        title: 'Statistiques',
        description: 'Stockage, bande passante, requêtes, lectures et téléchargements ; séries quotidiennes et mensuelles.',
        permission: 'stats:read',
        params: [{ name: 'days', in: 'query', description: 'Longueur de la série quotidienne, de 1 à 90 jours.' }],
        response: { status: 200, example: { success: true, overview: { storage: { used: 73443926016, files: 4821 } }, daily: [{ day: '2026-10-06', streams: 1204, bytesOut: 9876543210 }] } },
      },
      {
        id: 'logs',
        method: 'GET',
        path: '/api/v1/logs',
        title: 'Journal d’audit',
        description: 'UPLOAD, DOWNLOAD, STREAM, DELETE, RESTORE, CREATE_LINK, REVOKE_LINK, CREATE_API_KEY, REVOKE_API_KEY…',
        permission: 'logs:read',
        params: [
          { name: 'action', in: 'query', description: 'Filtre par action.' },
          { name: 'result', in: 'query', description: 'SUCCESS ou FAILURE.' },
        ],
        response: { status: 200, example: { success: true, logs: [{ action: 'UPLOAD', result: 'SUCCESS', fileId: FILE.id, actor: 'Karaks web (ks_live_abcd…)', createdAt: '2026-10-06T10:24:00.000Z' }] } },
      },
      {
        id: 'webhooks',
        method: 'POST',
        path: '/api/v1/webhooks',
        title: 'Créer un webhook',
        description: 'Événements : file.uploaded, file.updated, file.deleted, file.restored, file.streamed, file.downloaded, link.created, link.expired. Le secret n’est renvoyé qu’ici.',
        permission: 'webhooks:manage',
        body: { type: 'json', example: { url: 'https://api.karaks.com/webhooks/storage', events: ['file.uploaded', 'file.deleted'] } },
        response: { status: 201, example: { success: true, webhook: { id: 'cm1y…', active: true }, secret: 'whsec_…' } },
      },
    ],
  },
  {
    id: 'statut',
    title: 'État du service',
    intro:
      'Sans authentification. Une application cliente peut l’interroger pour expliquer une panne à ses utilisateurs plutôt que d’afficher une erreur générique. La même information est publiée sur la page /statut.',
    endpoints: [
      {
        id: 'status',
        method: 'GET',
        path: '/api/v1/status',
        title: 'Lire l’état du service',
        description: 'status : ok, degraded ou down, pour l’ensemble et par fonction. Réponse 503 si une fonction est interrompue. Soixante appels par minute et par adresse.',
        response: {
          status: 200,
          example: {
            success: true,
            status: 'ok',
            components: [
              { id: 'api', label: 'API et tableau de bord', level: 'ok' },
              { id: 'storage', label: 'Stockage et diffusion des fichiers', level: 'ok' },
              { id: 'links', label: 'Liens temporaires', level: 'ok' },
            ],
            checkedAt: '2026-10-07T12:00:00.000Z',
          },
        },
      },
    ],
  },
]

export const ERRORS: { status: number; code: string; meaning: string }[] = [
  { status: 400, code: 'bad_request', meaning: 'Requête invalide ; details liste les champs en cause.' },
  { status: 401, code: 'unauthorized', meaning: 'Clé absente, invalide, révoquée ou expirée.' },
  { status: 403, code: 'forbidden', meaning: 'Permission manquante ; details.missing la nomme.' },
  { status: 404, code: 'not_found', meaning: 'Ressource absente ou hors du projet de la clé.' },
  { status: 409, code: 'conflict', meaning: 'Nom déjà pris, dossier non vide.' },
  { status: 410, code: 'gone', meaning: 'Lien expiré, révoqué ou épuisé ; session d’envoi expirée.' },
  { status: 413, code: 'payload_too_large', meaning: 'Fichier ou morceau trop grand.' },
  { status: 415, code: 'unsupported_media_type', meaning: 'Type refusé, ou contenu qui ne correspond pas à l’extension.' },
  { status: 416, code: 'range_not_satisfiable', meaning: 'Plage hors du fichier.' },
  { status: 429, code: 'rate_limited', meaning: 'Limite de requêtes atteinte ; Retry-After indique le délai.' },
  { status: 503, code: 'storage_unavailable', meaning: 'Fournisseur de stockage indisponible ou à reconnecter.' },
  { status: 507, code: 'quota_exceeded', meaning: 'Quota du projet ou espace du stockage atteint.' },
]

// ---------------------------------------------------------------------------
// Exemples de code (CDS 6.5 : cURL, JavaScript, Python, PHP)
// ---------------------------------------------------------------------------

function url(base: string, endpoint: Endpoint) {
  return `${base}${endpoint.path.replace('{id}', endpoint.path.includes('/uploads') ? 'upl_Hs7dK2pQm9xA' : endpoint.path.includes('/folders') ? 'fld_Pq8sYw2mNc4r' : endpoint.path.includes('/links') ? 'cm1xLienExemple' : FILE.id)}`
}

export function examples(base: string, endpoint: Endpoint) {
  const target = url(base, endpoint)
  const json = endpoint.body?.type === 'json' ? JSON.stringify(endpoint.body.example, null, 2) : null
  const extraHeaders = Object.entries(endpoint.headers ?? {})

  const curl = [
    `curl -X ${endpoint.method} "${target}"`,
    '  -H "Authorization: Bearer $KARAKS_STORAGE_KEY"',
    ...extraHeaders.map(([key, value]) => `  -H "${key}: ${value}"`),
    ...(json ? ['  -H "Content-Type: application/json"', `  -d '${JSON.stringify(endpoint.body!.example)}'`] : []),
    ...(endpoint.body?.type === 'multipart' ? ['  -F "file=@song.mp3"', '  -F "folderId=fld_Pq8sYw2mNc4r"'] : []),
    ...(endpoint.body?.type === 'binary' ? ['  --data-binary @morceau.bin'] : []),
  ].join(' \\\n')

  const jsHeaders = [`Authorization: \`Bearer \${process.env.KARAKS_STORAGE_KEY}\``, ...extraHeaders.map(([key, value]) => `'${key}': '${value}'`), ...(json ? [`'Content-Type': 'application/json'`] : [])]
  const javascript =
    endpoint.body?.type === 'multipart'
      ? `const form = new FormData()\nform.append('file', fichier)\nform.append('folderId', 'fld_Pq8sYw2mNc4r')\n\nconst response = await fetch('${target}', {\n  method: 'POST',\n  headers: { Authorization: \`Bearer \${process.env.KARAKS_STORAGE_KEY}\` },\n  body: form,\n})\nconst data = await response.json()`
      : `const response = await fetch('${target}', {\n  method: '${endpoint.method}',\n  headers: {\n    ${jsHeaders.join(',\n    ')},\n  },${json ? `\n  body: JSON.stringify(${JSON.stringify(endpoint.body!.example)}),` : endpoint.body?.type === 'binary' ? '\n  body: morceau,' : ''}\n})\n${endpoint.path.endsWith('stream') || endpoint.path.endsWith('download') ? 'const audio = await response.arrayBuffer()' : 'const data = await response.json()'}`

  const pyHeaders = [`"Authorization": f"Bearer {os.environ['KARAKS_STORAGE_KEY']}"`, ...extraHeaders.map(([key, value]) => `"${key}": "${value}"`)]
  const python = `import os\nimport requests\n\nresponse = requests.${endpoint.method.toLowerCase()}(\n    "${target}",\n    headers={${pyHeaders.join(', ')}},${json ? `\n    json=${JSON.stringify(endpoint.body!.example).replace(/null/g, 'None').replace(/true/g, 'True').replace(/false/g, 'False')},` : ''}${endpoint.body?.type === 'multipart' ? `\n    files={"file": open("song.mp3", "rb")},\n    data={"folderId": "fld_Pq8sYw2mNc4r"},` : ''}${endpoint.body?.type === 'binary' ? '\n    data=morceau,' : ''}\n)\n${endpoint.path.endsWith('stream') || endpoint.path.endsWith('download') ? 'contenu = response.content' : 'data = response.json()'}`

  const phpHeaders = [`'Authorization: Bearer ' . getenv('KARAKS_STORAGE_KEY')`, ...extraHeaders.map(([key, value]) => `'${key}: ${value}'`), ...(json ? [`'Content-Type: application/json'`] : [])]
  const php = `<?php\n$ch = curl_init('${target}');\ncurl_setopt_array($ch, [\n    CURLOPT_CUSTOMREQUEST => '${endpoint.method}',\n    CURLOPT_RETURNTRANSFER => true,\n    CURLOPT_HTTPHEADER => [${phpHeaders.join(', ')}],${json ? `\n    CURLOPT_POSTFIELDS => json_encode(${phpArray(endpoint.body!.example)}),` : ''}${endpoint.body?.type === 'multipart' ? `\n    CURLOPT_POSTFIELDS => ['file' => new CURLFile('song.mp3'), 'folderId' => 'fld_Pq8sYw2mNc4r'],` : ''}\n]);\n$response = curl_exec($ch);\n${endpoint.path.endsWith('stream') || endpoint.path.endsWith('download') ? '' : '$data = json_decode($response, true);'}`

  return { curl, javascript, python, php }
}

function phpArray(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return `[${value.map(phpArray).join(', ')}]`
  if (typeof value === 'object') {
    return `[${Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `'${key}' => ${phpArray(item)}`)
      .join(', ')}]`
  }
  return typeof value === 'string' ? `'${value}'` : String(value)
}

// ---------------------------------------------------------------------------
// Document OpenAPI 3.1
// ---------------------------------------------------------------------------

export function openApiDocument(base: string) {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const section of SECTIONS) {
    for (const endpoint of section.endpoints) {
      const operation: Record<string, unknown> = {
        operationId: endpoint.id,
        summary: endpoint.title,
        description: endpoint.description + (endpoint.permission ? `\n\nPermission requise : ${endpoint.permission}.` : ''),
        tags: [section.title],
        parameters: [
          ...(endpoint.params ?? []).flatMap((param) =>
            param.name.split(',').map((name) => ({
              name: name.trim(),
              in: param.in,
              required: param.in === 'path' ? true : Boolean(param.required),
              description: param.description,
              schema: { type: 'string' },
            })),
          ),
          ...Object.entries(endpoint.headers ?? {}).map(([name, example]) => ({ name, in: 'header', example, schema: { type: 'string' } })),
        ],
        responses: {
          [endpoint.response.status]: {
            description: 'Réussite',
            content:
              typeof endpoint.response.example === 'string'
                ? { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } }
                : { 'application/json': { example: endpoint.response.example } },
          },
          default: { description: 'Erreur', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      }
      if (endpoint.body) {
        operation.requestBody = {
          required: true,
          content:
            endpoint.body.type === 'json'
              ? { 'application/json': { example: endpoint.body.example } }
              : endpoint.body.type === 'multipart'
                ? {
                    'multipart/form-data': {
                      schema: {
                        type: 'object',
                        properties: Object.fromEntries(
                          (endpoint.body.fields ?? []).map((field) => [field.name.split(',')[0], { type: 'string', description: field.description, ...(field.name === 'file' ? { format: 'binary' } : {}) }]),
                        ),
                        required: ['file'],
                      },
                    },
                  }
                : { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
        }
      }
      paths[endpoint.path] = { ...(paths[endpoint.path] ?? {}), [endpoint.method.toLowerCase()]: operation }
    }
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Karaks Storage API',
      version: '1.0.0',
      description: 'Stockage, Media API et diffusion sécurisée. Authentification par clé API : Authorization: Bearer ks_…',
    },
    servers: [{ url: base }],
    security: [{ apiKey: [] }],
    components: {
      securitySchemes: { apiKey: { type: 'http', scheme: 'bearer', description: 'Clé API du projet (ks_live_… ou ks_test_…).' } },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', const: false },
            error: { type: 'object', properties: { code: { type: 'string', enum: ERRORS.map((item) => item.code) }, message: { type: 'string' }, details: {} } },
          },
        },
      },
    },
    paths,
  }
}
