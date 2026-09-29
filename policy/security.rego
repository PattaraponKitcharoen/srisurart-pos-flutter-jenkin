# Lab 06 — Policy Gate: deny the build when a dependency scan reports a CRITICAL CVE.
#
# Input (built by policy/build-input.mjs from this build's reports):
#   input.audit  — `pnpm audit --json` (GitHub Advisory Database)
#   input.trivy  — `trivy sbom` over the signed CycloneDX SBOM (Trivy's own database)
# Two independent scanners, one clause each: a CVE that one database misses or grades lower
# is still caught by the other. Evaluated with `opa eval --fail-defined ... data.srisurart.security.deny[msg]`.
package srisurart.security

import rego.v1

# Clause 1 — pnpm audit reports a critical advisory.
deny contains msg if {
	some adv in input.audit.advisories
	adv.severity == "critical"
	msg := sprintf("pnpm audit: CRITICAL %s in %s@%s (%s) — %s", [
		concat(",", adv.cves), adv.module_name, adv.findings[0].version,
		adv.github_advisory_id, adv.title,
	])
}

# Clause 2 — Trivy, scanning the SBOM, reports a critical vulnerability.
deny contains msg if {
	some result in input.trivy.Results
	some vuln in result.Vulnerabilities
	vuln.Severity == "CRITICAL"
	msg := sprintf("trivy sbom: CRITICAL %s in %s@%s — %s", [
		vuln.VulnerabilityID, vuln.PkgName, vuln.InstalledVersion, vuln.Title,
	])
}
