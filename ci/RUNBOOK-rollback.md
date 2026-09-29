# Runbook — `Deploy — Production` failed (srisurart API, blue/green on kind)

Who: the on-call engineer. When: a `srisurart-api/main` build is red at
**Deploy — Production**, or users report errors right after one went green.
Everything below runs from a machine with `kubectl` and the admin kubeconfig
(`lab07/kubeconfig-kind-internal` on the Jenkins agent network, or the host copy
`lab09/kubeconfig-host`). Namespace: `srisurart`. Service: `srisurart`
(selector `color: blue|green`). Deployments: `srisurart-blue`, `srisurart-green`.

```bash
export KUBECONFIG=~/Desktop/JenkinsLab/lab09/kubeconfig-host
NS=srisurart
```

## 0. Stop new deploys first (1 minute)

A second merge must not start another deploy while you work.

- Jenkins → `srisurart-api` → **Disable Multibranch Pipeline** (a branch job cannot be
  disabled on its own), and abort any `main` build still running.
- Tell the team in the channel: "prod deploy frozen, rollback in progress, build #N".

## 1. Find out what the pipeline already did (2 minutes)

Open the failed build's console. The deploy stage prints, in order:

| Console line | Meaning |
|---|---|
| `Service srisurart serves <OLD>; deploying <image> to <NEW>` | OLD is still live |
| `rollout status deployment/srisurart-<NEW>` failed | NEW never became ready → traffic never moved |
| `Smoke test of srisurart-<NEW> failed` | NEW ran but `/health/ready` failed → traffic never moved |
| `ROLLBACK: deploy to <NEW> failed; keeping traffic on <OLD>` | the pipeline's `post { failure }` already rolled back |
| `Switched traffic from <OLD> to <NEW>` + errors reported afterwards | bad release is **live** → go to step 3 |

## 2. Verify the automatic rollback (when the console shows `ROLLBACK:`)

```bash
kubectl -n $NS get svc srisurart -o jsonpath='{.spec.selector.color}'; echo    # must be OLD
kubectl -n $NS get deploy srisurart-blue srisurart-green \
  -o custom-columns=NAME:.metadata.name,IMAGE:.spec.template.spec.containers[0].image,READY:.status.readyReplicas
kubectl -n $NS rollout status deployment/srisurart-<OLD> --timeout=60s
kubectl -n $NS run rb-check --rm -i --restart=Never --image=curlimages/curl:8.16.0 -- \
  curl -sf --max-time 10 http://srisurart:3000/health/ready
```

All four good → users are on the last good image; go to step 4.

## 3. Manual rollback (traffic already switched, or the automatic one did not finish)

1. **Move traffic back** — one API call, takes effect immediately:
   ```bash
   kubectl -n $NS patch svc srisurart -p '{"spec":{"selector":{"color":"<OLD>"}}}'
   ```
2. If the OLD colour is not ready (`READY` empty above), return it to its previous
   ReplicaSet and wait:
   ```bash
   kubectl -n $NS rollout history deployment/srisurart-<OLD>
   kubectl -n $NS rollout undo deployment/srisurart-<OLD>
   kubectl -n $NS rollout status deployment/srisurart-<OLD> --timeout=120s
   ```
3. Re-run the health check from step 2 against `http://srisurart:3000/health/ready`.
4. Put the failed colour back on a known-good image so the next deploy starts clean:
   ```bash
   kubectl -n $NS rollout undo deployment/srisurart-<NEW>
   ```

Every image is tagged with its commit (`localhost:5001/srisurart-server:<sha7>`), so
"known good" is the tag of the last green `main` build (its e-mail and its
`Push Image` stage both name it). To pin one explicitly:
`kubectl -n $NS set image deployment/srisurart-<OLD> app=localhost:5001/srisurart-server:<sha7>`.

## 4. Database

`deploy/k8s/bootstrap.sh` runs `migrate up` **before** the new colour starts, so the
old image now runs on the new schema. Check what the release added:
`git diff <good-sha7> <bad-sha7> -- server/src/db/migrations/`. Only added tables,
columns or indexes → the old image is unaffected; carry on. A dropped or renamed
column → the old image may fail too: escalate to the owner. **Never run
`migrate down` against production data as an on-call step.**

## 5. Close out

- Re-enable `srisurart-api` only after the fix is merged; the next build must pass
  every gate again, including the Pipeline Health Gate (a failed deploy lowers the
  success rate, so an immediate retry may be refused — that is intended).
- Record: build number, bad `<sha7>`, time traffic moved back, root cause, follow-up.
