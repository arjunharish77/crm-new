# ML Service

Internal-only Python service that trains and scores a gradient-boosted predictive scoring
model for leads and opportunities, as a third candidate alongside the Node app's built-in
heuristic and logistic-regression scoring (see `src/lib/server/self-learning-scoring.ts`).
Not exposed to the internet -- only reachable from the Node app/worker on the internal
Docker network, the same trust tier as `postgres`/`redis`.

## Local development

One-time setup (creates a venv and installs dependencies):

```bash
npm run ml-service:setup
```

Run it:

```bash
npm run ml-service:dev
```

It reads the same `.env`/`.env.local` the rest of the app uses (see `app/config.py`) --
no separate env file needed in local dev. It needs `DATABASE_URL` or `DIRECT_DATABASE_URL`
to be set, and **also needs `ML_SERVICE_SECRET` set (to any non-empty value)** -- this
service has no prod/dev distinction, so it fails closed and refuses to start at all
(`RuntimeError: Missing env var: ML_SERVICE_SECRET`) rather than ever running with
`/train`/`/score`/`/nba-score-batch` unauthenticated. Set the same value in your
`.env.local` that the Node app's `ML_SERVICE_SECRET` uses, so `self-learning-scoring.ts`'s
requests authenticate; without a matching value on the Node side, calls will 401 and
recompute falls back to the JS candidates (see below) rather than actually using this
service, so for local `curl`ing pass `-H "X-Internal-Auth: <your ML_SERVICE_SECRET value>"`.

Check it's up:

```bash
curl http://localhost:8000/health
```

If the Node app can't reach this service (not running, network error, timeout), recompute
silently falls back to the existing JS heuristic/logistic candidates -- this service is
purely additive, never a hard dependency.

## Docker

Built and run as the `ml-service` service in `deploy/vps/docker-compose.yml`, sharing the
`app-storage` volume with `web`/`worker` so trained model artifacts are readable by whichever
container needs them next, without a separate object-storage dependency.
