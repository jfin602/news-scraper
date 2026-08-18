# Source and endpoint onboarding

This guide is the operator-facing procedure for adding a publisher to a deployed News Scraper installation through the protected `/admin` control plane.

It explains how the existing Source and endpoint fields are intended to be used. It does not redefine collection, approval, network-safety, Relevance, Category, duplicate, or public-feed behavior. When this guide and a governing contract disagree, the contract wins. The primary authority for Source and endpoint behavior is `docs/contracts/source-and-collection-contract.md`; public/admin behavior is governed by `docs/contracts/public-feed-and-admin-contract.md`.

## Mental model

A **Source** is the publisher or outlet that the operator trusts and manages.

A **Source endpoint** is a specific location and method used to collect from that Source, such as an RSS/Atom feed or a configured static HTML listing page.

Keep these concepts separate:

- **Approval** answers: is this Source or endpoint trusted for collection?
- **Operational state** answers: should this Source or endpoint run now?
- **Lifecycle state** answers: is this configuration active or archived/retired?
- **Health** answers: is recent collection behavior healthy? Health is derived operational information, not an approval or pause control.

The safest normal onboarding sequence is:

```text
configure
→ inspect
→ approve
→ enable
→ Check now
→ inspect health and recent runs
```

A Source or endpoint is not trusted merely because a URL exists, was discovered during reconnaissance, or fetched successfully.

## Collection eligibility at a glance

An endpoint can be contacted only when all of the governing eligibility conditions are satisfied, including:

- the singleton Publication is active for collection;
- the Source is `approved`, `active`, and `enabled`;
- the endpoint is `approved`, `active`, and `enabled`;
- the endpoint URL remains inside the configured domain policy;
- destination/network-safety checks pass; and
- the shared endpoint run lock can be acquired.

This is why approval, operational state, lifecycle state, domain policy, and health are shown separately in the admin UI.

# Eight-step onboarding procedure

## 1. Create the Source first, initially unapproved and disabled

Open `/admin`, select **Sources**, then choose **New Source**.

The Source describes the publisher itself. Configure it before allowing collection. For a new Source, the recommended operator workflow is to create it as **Unapproved** and **Disabled**, then deliberately approve and enable it after its identity, domain policy, and endpoints have been reviewed.

### Source fields

#### Configuration key

Purpose: permanent machine-readable identity for the Source inside this installation.

Use a short lower-snake-case identifier such as:

```text
jane_friedman
author_media
the_creative_penn
```

Rules and behavior:

- immutable after creation;
- lowercase letters and numbers separated by single underscores;
- installation-wide Source identity;
- do not put presentation wording, URLs, dates, or temporary status in the key.

Treat this as a stable internal identifier, not the customer-facing Source name.

#### Display name

Purpose: human-readable publisher name shown in the admin UI and used as the Source label in public/feed presentation where applicable.

Examples:

```text
Jane Friedman
Author Media
The Creative Penn
```

Use the publisher's recognizable name rather than a feed title or endpoint label.

#### Site URL

Purpose: the publisher's normal website/homepage identity.

Example:

```text
https://janefriedman.com/
```

This is not necessarily the URL collected by the Worker. The actual feed/listing location belongs on the endpoint.

Use an absolute URL with a hostname. Credentials must never be embedded in configured URLs.

#### Priority

Purpose: Source preference used when the system needs deterministic Source ordering, including automatic Primary selection among Articles grouped as true duplicates.

Higher numeric priority is preferred before lower priority during automatic duplicate Primary selection. Other article-quality tie-breakers apply after Source priority.

Operational guidance:

- use `0` when no deliberate Source preference has been established;
- if the Publication needs publisher preference, choose a simple documented scale and use it consistently;
- do not change priority casually merely to alter one duplicate decision when manual duplicate moderation is the correct authority.

#### Default Category

Purpose: fallback Category for Articles from this Source when no matching categorize Relevance rule assigns a Category and no endpoint-specific default overrides it.

Category precedence is:

```text
matching categorize Relevance rules
→ endpoint default Category
→ Source default Category
```

Leave the Source default empty when there is no sensible publisher-wide fallback.

#### Initial Approval

Purpose: explicit trust decision for the Source.

Values:

- `Unapproved` — the Source is not trusted for collection.
- `Approved` — the operator explicitly trusts the Source, subject to the rest of the eligibility gates.

Recommended onboarding default: **Unapproved** until the Source identity, domains, and endpoint configuration have been inspected.

A successful fetch never grants approval automatically.

#### Initial Operational state

Purpose: controls whether an otherwise eligible Source is allowed to run now.

Values:

- `Enabled` — collection may proceed when all other gates pass.
- `Paused` — temporarily stop collection while retaining the Source as an active configuration.
- `Disabled` — do not collect from the Source until deliberately enabled.

Recommended onboarding default: **Disabled** while configuring and testing the trust boundary.

Operational state is not health and is not approval.

#### Lifecycle state

Purpose: distinguishes active configuration from retired/archived configuration.

Lifecycle is managed after creation through the Source state actions rather than as a normal creation field.

- `Active` — the Source remains part of the current managed configuration.
- `Archived` — the Source is retired from active operation but retained as governed configuration/history.

Restoring an archived Source does not implicitly approve or enable it.

## 2. Define the Source approved-domain boundary

The **Approved Source domains** list is the maximum trust boundary for that publisher.

Each rule contains:

### Hostname

Purpose: DNS hostname the platform is permitted to treat as belonging to this Source for governed endpoint/redirect/Article-link policy.

Enter a hostname only, for example:

```text
janefriedman.com
www.authormedia.com
www.thecreativepenn.com
```

Do not enter:

```text
https://janefriedman.com/blog/
*.janefriedman.com
janefriedman.com/feed/?x=1
```

The field is not a URL, path, wildcard expression, or regular expression.

### Include subdomains

Purpose: deliberately extends that hostname rule to subdomains beneath it.

When off, the rule matches the exact hostname only. When on, the parent hostname and its subdomains are included.

Subdomain permission is explicit; the platform does not silently infer it from a parent domain.

### How to choose Source domains

Start from publisher ownership, not from whatever redirect happens to make a test pass.

Ask:

1. Which hostname serves the configured endpoint?
2. Which publisher-owned hostname(s) legitimately host Article destinations from that endpoint?
3. Does the publisher intentionally use subdomains that must be included?

Only approve the domains that are actually required and understood.

The Source domain list is a **maximum** boundary. Endpoint rules may inherit or narrow it, but they cannot widen it.

## 3. Configure RSS/Atom item admission phrases only when needed

The **RSS/Atom item admission phrases** field is an optional Source-owned pre-normalization filter. It exists for a broad RSS/Atom Source where only part of the feed should enter the Article-candidate pipeline.

### What empty means

**No configured phrases means collect/admit every otherwise-valid parsed RSS/Atom item.**

There is no separate enabled switch. Empty is the collect-all state.

For a Source whose feed is already tightly focused on the Publication topic, leaving this field empty is often the clearest starting point.

### What configured phrases mean

When one or more phrases are configured, an RSS/Atom Raw item is admitted when **any one** configured phrase matches.

Matching is:

- deterministic;
- case-insensitive;
- literal substring matching;
- include-only.

The filter may inspect only the RSS/Atom parser's existing editorial text from:

- title;
- summary/content text; and
- Source-provided category labels.

Example phrases for a hypothetical broad publishing feed might be:

```text
self-publishing
indie author
book marketing
```

An item matching any one phrase is admitted to the normal downstream pipeline.

### What admission phrases are not

They are not:

- Relevance rules;
- an exclude list;
- regex;
- glob/wildcard matching;
- fuzzy matching;
- stemming;
- semantic/AI classification;
- public-feed search filtering; or
- an HTML-listing keyword filter.

They do not fetch or inspect the full Article page.

### Pipeline position

For RSS/Atom, the conceptual order is:

```text
fetch
→ RSS/Atom parse
→ Raw item
→ optional Source admission phrases
→ Article-candidate normalization
→ Article-link policy
→ Relevance/Categories
→ Source-scoped Article identity/persistence
→ duplicate/public behavior
```

A mismatching Raw item stops before Article-candidate normalization. It is not a Relevance `excluded` result and it does not create an Article observation.

Admission-phrase edits are prospective. Changing the phrases does not automatically rescan, hide, delete, or recategorize Articles already stored from earlier collection runs.

### Limits and operator guidance

The implementation accepts a bounded list of non-empty trimmed phrases. Use concise literal phrases rather than trying to encode a complex editorial rules engine here. If the desired decision requires include/exclude/categorize logic, use the governed Relevance system instead.

## 4. Keep the Source unapproved and disabled until configuration is understood

After entering the Source fields, save it in the safe onboarding state unless the configuration has already been deliberately reviewed.

Recommended initial state:

```text
Approval: Unapproved
Operational state: Disabled
Lifecycle: Active
```

This preserves a clear operator sequence:

```text
configure → inspect → approve → enable
```

Do not use `Paused`, `Disabled`, `Unapproved`, or `Archived` as substitutes for one another:

- **Unapproved** = not trusted.
- **Disabled** = trusted or untrusted configuration that should not run.
- **Paused** = temporary operational stop.
- **Archived** = retired lifecycle state.
- **Unhealthy** = derived collection condition, not a state-control choice.

## 5. Create the endpoint

Select the Source, then choose **New endpoint**.

The endpoint describes the actual collection location and parser type.

### Endpoint fields

#### Configuration key

Purpose: permanent machine-readable identity for this endpoint within its Source.

Examples:

```text
site_rss
blog_rss
podcast_rss
news_listing
```

The endpoint key is immutable after creation and Source-scoped. Use a stable functional name, not a URL or temporary label.

#### Type

Purpose: selects the collection parser adapter.

Current supported types:

- **RSS / Atom (`rss_atom`)** — preferred structured-feed path. The parser determines whether the fetched XML is RSS or Atom; the operator does not need to pre-classify the dialect.
- **HTML listing (`html_listing`)** — configured bounded static HTML listing extraction when an approved Source has no suitable structured feed for that content.

Prefer RSS/Atom when a suitable approved feed exists.

#### Endpoint URL

Purpose: exact URL contacted by the Worker for this endpoint.

Examples:

```text
https://example.com/feed/
https://example.com/blog/
```

The endpoint URL must be an absolute URL with a hostname and no embedded credentials. Its hostname must be inside the effective Source/endpoint approved-domain policy before the endpoint may be approved for collection.

#### Poll interval (seconds)

Purpose: controls how often ordinary scheduling considers the endpoint due for collection.

The backend requires a positive bounded interval; the current supported range is 60 seconds through 2,592,000 seconds (30 days).

Guidance:

- do not use aggressive polling merely because a lower value is technically permitted;
- match polling to the publisher's realistic update frequency and operational needs;
- operational state, not a zero interval, is how collection is disabled.

#### Default Category

Purpose: endpoint-specific fallback Category.

If no matching categorize Relevance rule assigns a Category, the endpoint default wins over the Source default. Leave it empty when no endpoint-wide fallback is appropriate.

#### Initial Approval

Purpose: explicit trust decision for this exact endpoint.

Recommended onboarding default: **Unapproved** until URL, type, domain policy, and parser configuration have been reviewed.

Source approval does not automatically approve an endpoint.

#### Initial Operational state

Purpose: controls whether this endpoint may run now after the other eligibility gates pass.

Recommended onboarding default: **Disabled** while configuration is being completed.

### HTML listing profile fields

These fields appear only for an **HTML listing** endpoint. They configure a bounded static parser over the one fetched listing page. The platform does not crawl Article pages, follow listing pagination, execute JavaScript, or load page subresources.

#### Item/root CSS selector

Purpose: selects each repeating listing item that may become one Raw item.

This is the root boundary within which the other selectors are evaluated.

#### Title selector

Purpose: selects the headline/title text inside each item root.

A usable title is required for an emitted Raw item.

#### Article-link selector

Purpose: selects the element whose governed link `href` identifies the original Article destination.

A usable Article link is required for an emitted Raw item. Relative links are allowed because normal collection resolves them against the terminal fetched endpoint URL before downstream Article-link validation.

#### Published date selector

Purpose: optionally identifies the element containing the publication date/time.

Leave empty when the listing does not expose a reliable published date.

#### Published date extraction

Purpose: chooses whether the published date is read from element text or from one of the allowlisted attributes.

When **Attribute** is selected, the configured published-date attribute must be one of the UI's allowlisted values, such as `datetime`, `data-published-at`, or `data-updated-at`.

#### Updated date selector

Purpose: optionally identifies the element containing the last-updated date/time.

#### Updated date extraction

Purpose: chooses text or an allowlisted attribute for the updated date, using the same bounded extraction model as the published date.

#### Author selector

Purpose: optionally extracts visible author/byline text from the listing item.

#### Summary selector

Purpose: optionally extracts visible summary/excerpt text from the listing item.

#### Category-label selector

Purpose: optionally extracts Source-provided category/label text from the listing item.

This does not apply the Source RSS/Atom admission-phrase filter to HTML. HTML rows are selected by the configured HTML profile and then rejoin the shared downstream pipeline.

### HTML sample preview

The **HTML sample preview** lets an operator paste bounded sample HTML and test the draft profile without making a network request.

Preview:

- parses only the pasted sample;
- performs no DNS or publisher request;
- does not save the endpoint;
- creates no Collection run;
- changes no health/scheduler state; and
- does not prove that real collection will succeed.

Use preview to validate selectors, then use the normal saved endpoint plus **Check now** to exercise the real governed collection path.

## 6. Normally inherit the Source domain policy

The endpoint domain-policy section offers two modes.

### Inherit the Source maximum

Purpose: use the Source approved-domain rules unchanged for this endpoint.

This is the normal choice when the endpoint and its legitimate redirects/Article destinations require the same trust boundary as the Source.

### Narrow the Source policy for this endpoint

Purpose: intentionally restrict this endpoint to a smaller subset of the Source-approved boundary.

Use narrowing when a Source owns multiple approved hostnames but this specific endpoint should be restricted to only one or a smaller subdomain boundary.

Endpoint rules can only reduce the Source policy. They cannot add a new domain or silently widen trust.

## 7. Explicitly approve and enable both the Source and endpoint

After the Source and endpoint configuration has been reviewed, use the state controls deliberately.

For ordinary collection, require:

```text
Publication: Collection active
Source: Approved + Active + Enabled
Endpoint: Approved + Active + Enabled
```

Approval and enablement are required at both Source and endpoint level.

A publisher may be trusted while one of its endpoints remains unapproved or disabled. Likewise, an endpoint cannot bypass an unapproved, disabled, paused, or archived Source.

When retiring configuration, prefer the existing archive lifecycle action rather than physical deletion. Restoring archived configuration does not automatically resume collection.

## 8. Run Check now, then inspect health and recent runs

Once the endpoint is fully eligible, select it and choose **Check now**.

`Check now` queues durable Worker work through the normal governed path. An accepted admin response means the job request was accepted/queued or otherwise classified; it does **not** mean publisher collection has already completed.

After using Check now:

1. refresh the endpoint operational data;
2. inspect derived health;
3. inspect the newest Collection runs;
4. verify the run trigger and stage/count information; and
5. verify resulting eligible Articles through the normal public/admin surfaces when applicable.

Interpret common outcomes truthfully:

- **successful content run** — endpoint fetched/parsing/processing completed successfully;
- **`304 not_modified`** — the publisher correctly reported that previously fetched feed content is unchanged; this is not a transport failure and does not prove new content was collected;
- **items filtered by Source admission phrases** — the feed was fetched and parsed, but some/all RSS/Atom Raw items did not pass the Source admission filter;
- **parser/profile failure** — the response was reached but did not satisfy the selected parser/profile expectations;
- **transport/network-safety failure** — the request could not proceed or complete under the governed destination/transport policy;
- **ineligible** — one or more approval/lifecycle/operational/Publication gates prevents collection;
- **already outstanding** — durable work already exists for the endpoint rather than a second overlapping run being created.

Do not respond to a failed check by widening domains or weakening safety merely to make the request pass. Diagnose the actual Source/endpoint configuration or publisher behavior first.

# Customer-demo explanation

A concise way to explain Source onboarding to a customer is:

> A Source represents a publisher we trust. I define the publisher's identity and the domain boundary we are willing to trust, then attach one or more collection endpoints such as an RSS feed or a configured HTML listing. Sources and endpoints are explicitly approved and enabled before the system is allowed to contact them. Once the configuration is ready, I can queue a Check now run and inspect its health and collection history without bypassing the normal Worker, security, or provenance pipeline.

# Operator checklist

Before calling a new Source ready for launch, confirm:

- Source identity and display name are correct;
- Source Site URL identifies the intended publisher;
- Source priority is intentional;
- Source default Category is intentional or empty;
- approved Source domains are no broader than necessary;
- subdomain inclusion is deliberate;
- RSS/Atom admission phrases are either intentionally empty or intentionally configured;
- Source is deliberately approved and enabled;
- every launch endpoint has the correct immutable key, type, URL, polling interval, and default Category;
- endpoint domain policy inherits or narrows the Source boundary without widening it;
- HTML listing profiles, when used, have been previewed with representative sample markup and then tested through real Check now collection;
- every launch endpoint is deliberately approved and enabled;
- Check now/recent-run evidence shows no unexplained failure;
- health is understood as an observation, not a state-control shortcut; and
- collected/public Articles link to the intended original publisher destinations.

For Phase 20 launch acceptance, continue with the final approved-endpoint health, per-Source public-feed quality sampling, duplicate/moderation review, deployed public/admin validation, operational baseline, and ownership/limitations requirements defined by the Phase 20 closeout task and governing operations documentation.
