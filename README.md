# Next template

Next.js template for my personal needs.

## Getting started

### Development

Copy the [.env.example](.env.example) file to a new file `.env` and fill in the variables.

```bash
cp .env.example .env
```

Run the database migration command:

```bash
bun db:migrate
```

Then start the development server:

```bash
bun dev
```

### Using template

#### Variables

- `APPLICATION_NAME` - Used as an identifier for multiple actions such as the Kubernetes deployment name and Terraform workspace.
- `BASE_DOMAIN` - Domain where to host the application. Tags are deployed to this domain; pull requests to a subdomain using the commit SHA (e.g. `<sha>.yourdomain.com`).
- `DEPLOYMENT_AUTH_EMAIL_FROM` - Name and email address of the magic link sender (e.g. `Next Template`).

The following variables are configured at the organisation level and are inherited automatically — no action needed per repository.

- `DOCKERHUB_USERNAME` - Docker Hub username for pushing images.

#### Secrets

The following secrets must be configured per repository.

- `DEPLOYMENT_AUTH_SECRET` - Better Auth secret for encrypting JWTs (generate with `bunx auth secret --raw`).
- `DEPLOYMENT_DISCORD_WEBHOOK_URL` - Discord webhook URL for in-application alerts.

The following secrets are configured at the organisation level and are inherited automatically — no action needed per repository.

- `KUBECONFIG` - Kubernetes cluster config for deploying to the cluster.
- `TAILSCALE_OAUTH_CLIENT_ID` - Tailscale OAuth client ID used to connect the CI runner to the private cluster network.
- `TAILSCALE_OAUTH_SECRET` - Tailscale OAuth secret paired with the client ID above.
- `DOCKERHUB_TOKEN` - Docker Hub access token.
- `DEPLOYMENT_AUTH_EMAIL_HOST` - SMTP host (e.g. `smtp.gmail.com`).
- `DEPLOYMENT_AUTH_EMAIL_PORT` - SMTP port (e.g. `465`).
- `DEPLOYMENT_AUTH_EMAIL_USER` - SMTP username (for Gmail, this is your email address).
- `DEPLOYMENT_AUTH_EMAIL_PASSWORD` - SMTP password (for Gmail, use an App Password).

## Deployments

To pass additional environment variables to the running container, create a GitHub variable or secret and prefix the name with `DEPLOYMENT_`. The prefix is stripped before the value is injected into the container.

## Guides

### Database

#### Migrations

To create a new migration, run the following command:

```bash
bun db:generate -- --name "<migration-name>"
```

Then to run all migrations, run:

```bash
bun db:migrate
```

When migration is imperfect,
delete the migration file, delete the new snapshot file in the meta-folder and roll back the \_journal.json file.

When thats done you can run the migration command again.

#### Database in Kubernetes

You can copy the sqlite file over this command:

```bash
kubectl cp <namespace>/<pod-name>:/app/data/db.sqlite ./prod-db.sqlite
```

With k9s you can copy the pod name with `c`

Windows with Datagrip shows a warning locking issues will occur because of WSL.
Copy the file to your Windows filesystem with the following command:

```bash
kubectl cp <namespace>/<pod-name>:/app/data/db.sqlite  /mnt/c/Users/<user>/Documents/
```
