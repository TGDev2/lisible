# GitHub Actions Workflows

Ce dossier contient les workflows CI/CD pour SME Studio.

## Workflows

### `ci.yml` - Continuous Integration

Déclenché sur :
- **Pull Request** vers `main`
- **Push** sur `main`

Jobs exécutés en parallèle :
1. **Lint** - Vérifie le code avec ESLint
2. **Type Check** - Vérifie les types TypeScript
3. **Test** - Exécute les tests unitaires
4. **Build** - Build le projet (après succès des 3 premiers jobs)

### `deploy-preview.yml` - Preview Deployments

Déclenché sur :
- **Pull Request** vers `main` (opened, synchronize, reopened)

Déploie une preview sur Vercel et ajoute un commentaire sur la PR avec l'URL.

### `deploy-prod.yml` - Production Deployment

Déclenché sur :
- **Push** sur `main` (merge de PR)

Déploie en production sur Vercel.

## Secrets GitHub Requis

Configurez ces secrets dans **Settings > Secrets and variables > Actions** :

| Secret | Description | Où l'obtenir |
|--------|-------------|--------------|
| `VERCEL_TOKEN` | Token d'authentification Vercel | [Vercel Dashboard > Settings > Tokens](https://vercel.com/account/tokens) |
| `VERCEL_ORG_ID` | ID de l'organisation/compte Vercel | `.vercel/project.json` après `vercel link` |
| `VERCEL_PROJECT_ID` | ID du projet Vercel | `.vercel/project.json` après `vercel link` |

### Secrets Optionnels (Turbo Remote Cache)

| Secret/Variable | Description |
|-----------------|-------------|
| `TURBO_TOKEN` | Token pour Turbo remote cache |
| `TURBO_TEAM` | Nom de l'équipe Turbo (variable, pas secret) |

## Configuration Vercel

1. Installez Vercel CLI :
   ```bash
   pnpm add -g vercel
   ```

2. Liez le projet :
   ```bash
   vercel link
   ```

3. Récupérez les IDs dans `.vercel/project.json` :
   ```json
   {
     "orgId": "votre-org-id",
     "projectId": "votre-project-id"
   }
   ```

4. Ajoutez les secrets dans GitHub.

## Bonnes Pratiques Sécurité

- **Ne jamais** logger les secrets dans les workflows
- Les secrets sont automatiquement masqués dans les logs GitHub
- Utilisez `secrets.*` pour les valeurs sensibles
- Utilisez `vars.*` pour les valeurs non sensibles (comme `TURBO_TEAM`)
