package srisurart.security_test

import rego.v1

import data.srisurart.security

critical_advisory := {"advisories": {"1": {
	"severity": "critical", "cves": ["CVE-2017-16082"], "module_name": "pg",
	"findings": [{"version": "7.1.0"}], "github_advisory_id": "GHSA-wc9v-mj63-m9g5",
	"title": "Remote Code Execution in pg",
}}}

test_audit_critical_is_denied if {
	count(security.deny) == 1 with input as {"audit": critical_advisory, "trivy": {"Results": []}}
}

test_trivy_critical_is_denied if {
	count(security.deny) == 1 with input as {"audit": {"advisories": {}}, "trivy": {"Results": [{"Vulnerabilities": [{
		"Severity": "CRITICAL", "VulnerabilityID": "CVE-2017-16082", "PkgName": "pg",
		"InstalledVersion": "7.1.0", "Title": "RCE",
	}]}]}}
}

test_high_and_moderate_are_allowed if {
	count(security.deny) == 0 with input as {
		"audit": {"advisories": {"1": {"severity": "moderate"}, "2": {"severity": "high"}}},
		"trivy": {"Results": [{"Vulnerabilities": [{"Severity": "HIGH"}]}, {"Target": "no vulns"}]},
	}
}
