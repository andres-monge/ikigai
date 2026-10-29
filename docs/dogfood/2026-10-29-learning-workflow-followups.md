# Learning workflow follow-ups — 29 October 2026

The three retained workflow blockers now pass their original failing parent/message shapes and the subsequent natural project acceptance/selection. Ordinary help and exploratory alternatives remain noncommitting. The founder subsequently verified normal Google sign-in, prior Chat restoration and saved Map/project/learning after reload in a separate Chrome Incognito session using the dedicated test account. The in-app browser navigation stall remains unresolved; no auth fix was shipped.

Base `d6f6df2`; implementation `2d53a32` (Foundation focus, U1), `21a25b0` (eligible project design, U2), `48f7bf1` (explicit new-project request, U3). [Approved plan](../plans/2026-10-29-1229-fix-learning-workflow-followups-plan.md), unchanged during implementation. No push, PR, deployment or heartbeat.

## Changes and deterministic evidence

Foundation forwards the existing pending decision only when its module matches the active focus. Exact target, current-message, completed-presentation and revision guards remain unchanged; impact acknowledgment remains the agent's semantic judgment. Selector, exact tool and mocked-agent regressions failed before the fix. Parent verification: **157 passed across three files**.

The Design briefing derives one-proposal versus three-option guidance directly from the checkpoint's available operations. Historical projects retain their actual path basis and learning. Design and the existing proposal-tool description now explain the eligible save flow. Three context regressions failed before implementation; legal save operations already worked. Parent verification: **226 passed, two existing bundle skips across seven files**.

Guide now routes a clear different/additional-project request through the existing request operation and refreshed Design checkpoint. Advice, refinement and exploratory alternatives retain their ordinary flows. The earlier real omitted-request output remains the semantic reproduction; a mocked response cannot prove intent recognition. Pre-change characterization passed **84 checks**; post-change verification passed **179, two existing bundle skips across five files**. New outgoing-SDK coverage verifies LOW Guide → MEDIUM Design and retained prior work/reflection.

No schema, lifecycle, operation family, stored mode, lexical detector or forced call on ordinary advice was added.

## Frozen real-agent retest

Candidate `learning-workflow-followups-20261029`, version `8202f91d3cca37b20fc6b2dbbc42e89f919f8da987b65c2f298198cc13cd5ecb`, frozen from `48f7bf1` after restarting the lab. Design **1.3.2**, Guide **1.0.2**; base **1.1.12**, Foundation **1.1.13**, Paths **1.1.7**, Interpret **1.0.1** and V4 voice unchanged. Outgoing request evidence retains Paths HIGH / Design MEDIUM / Foundation, Guide and Interpret LOW.

The three original failing cases reuse exact initial maps, prior turns, provider-item prefixes and current messages. Other contrasts branch from those same real generated prefixes or the earlier actual progress continuation. No canonical state was edited to manufacture a completed loop. Their earlier synthetic Foundation/path/project setup remains a disclosed bypass, not newly proven behavior.

| Case | Actual reply / operations | Actual saved result | Verdict |
| --- | --- | --- | --- |
| Same revised North Star impact acknowledgment (`90ea878e`) | Confirms the revision, resolves three ordered basis reviews and closes focus; no re-proposal loop | Revised North Star Confirmed; prior direction retained as history; original project/learning unchanged; revision 19, Paths ready for further conversation | PASS |
| Same changed-path choice with OPEN reflection (`86e7a019`) | Confirms changed path, resolves reviews, proposes/presents/delivers one project; recalls listening energy and writing resistance | One Suggested / Not started **Build a Paper-Sign Route for a Library Event**; original authored reflection byte-equal and still Open; revision 18 | PASS |
| Natural assent to that delivered proposal (`c5fa70b4`) | Accepts and offers practical help | New project Accepted / Not started; earlier reflection remains Open; revision 19 | PASS |
| Same focus/pause return requesting different work (`77c2d2f8`) | Records request, then saves three equal options grounded in earlier learning | **Map a Task Together**, **Compare Two Volunteers’ Stories**, **Find the Missing Information**; revision 19 | PASS |
| Natural selection of option 2 (`e53474d8`) | Selects the named option and continues guidance | Project 3 Accepted / Not started; earlier learning and path-focus commitments unchanged; revision 20 | PASS |
| Wording fits but impact not accepted (`f3354f55`) | Explains exact consequences and asks what matters; no operation | Entire canonical map unchanged, revision 14; suggested revision unconfirmed | PASS |
| Keep current project, help with first step (`743116cd`) | Useful rough-card preparation advice; no operation | Entire map unchanged, revision 17 | PASS |
| Think aloud about later alternatives (`a0cce772`) | Compares learning opportunities without committing; no operation | Entire map unchanged, revision 17 | PASS |
| Explicit another-project request BEFORE completed loop (`20345bba`) | Records request, proposes/presents/delivers one project | One Suggested / Not started **Listen Through One Volunteer Task**; no invented reflection, continuation choice or Next Move; revision 12 | PASS |

Job labels above are unique retained UUID prefixes.

The three follow-ons involve different work: co-mapping a task during a walkthrough, facilitating two people comparing experience, and diagnosing missing information in an instruction. All permit rough notes rather than polished reports. All nine turns used the same frozen candidate: **26 outgoing provider requests**, zero new rejected/conflicted tool results. Every original reflection record remains byte-equal to its input. First outputs and original failures are retained; no instruction change or favorable-output retry followed these runs.

Bundled Browser verified the new Foundation outcome, changed-path saved proposal and return selection in the local lab UI. This is a private-clone results view, not production Chat/Map or PostgreSQL evidence. Those lab checks do not establish authenticated app/mobile/re-authentication behavior; subsequent human Incognito evidence below verifies sign-in, restored Chat and saved Map/project/learning after reload for the dedicated account.

## Sign-in diagnosis and retained gaps

A supported browser-session reset restored documented IAB access. One normal attempt after that recovery reproduced the stall. A further coordinator-approved instrumented attempt recorded only positive allowlisted metadata:

- Actual isolated browser response: **HTTP 200**.
- SDK success: **redirect true**, authorization origin **accounts.google.com**.
- After the await: **no returned error**, page still **localhost:5173/login**, button still **Opening Google…**.

The installed SDK checks the scheme and attempts same-tab location assignment inside an empty catch. Those initial observations did not distinguish a thrown exception, ignored navigation or host restriction. No Google page or explicit host-denial event was observed. The direct server probe from planning is separate evidence and is not substituted for this browser trace.

The indefinite busy state has a narrower confirmed cause: Login enables busy before the call and clears it only for returned/thrown errors, so the observed successful return with no navigation has no recovery branch. A possible later UX scope is `client/src/pages/login.tsx` and its existing test: release busy after the SDK settles and provide neutral recovery copy without premature failure claims. The coordinator deferred that patch because it would not restore login. No timeout, redirect fallback, security-setting change or alternate browser/control mechanism was used.

Temporary diagnostics in auth-client/login were removed and exact original byte hashes restored before build, review or commit. No full URL, query, header/cookie value, OAuth state/token/code, response-body dump, identity or error object was retained.

A subsequent coordinator-approved diagnostic at baseline `61c85eb` instrumented the installed Better Auth **1.6.29** redirect callback without changing its conditions, safe-scheme check, location assignment, plugin order or catch behavior. The SDK file and generated Vite cache were verified checkout-local, with no symlink or hardlink sharing. After guarded main restart with zero active app leases, the browser received the module marker before **one** normal sign-in attempt in the existing isolated IAB session:

- Callback entry: URL present, redirect true, browser window present.
- The original safe-scheme guard passed and location was present.
- The original location assignment was attempted and returned normally; the catch marker did not appear.
- The post-assignment marker and later read-only observation still showed the local login page. No Google arrival or explicit host-denial message was observed.

For this observed attempt, the callback was neither skipped nor stopped by its guard, and the assignment did not throw into the SDK catch. The remaining gap is **why the normally returning location assignment does not produce an observed navigation**. This does not establish a host-policy restriction, Google configuration failure or SDK defect. The supported Browser navigation wrapper returned before the social-response callback markers while the page remained local; that return is not evidence of Google arrival.

The original SDK bytes and cache were restored before the final build. Comparison verified hashes, ownership, mode and modification times for the SDK and **67 cache entries**; all four protected WIP hashes match. Build passed after restoration, diagnostic markers were absent from the SDK, restored optimized bundle and built output, and the browser reloaded the restored app without another sign-in attempt. No lockfile, package version, global configuration, auth behavior, production fix, commit of dependency diagnostics, or founder session changed.

The founder then completed the coordinating chat's requested human-operated normal-login comparison in a separate **Chrome Incognito** window at approved `http://localhost:5173`, using the dedicated test account. The coordinator relayed the supplied screenshot/accessibility evidence: Incognito, the dedicated identity signed in, the full prior Chat including the final completed-welcome-sign reflection restored, and an empty composer. This establishes human-observed normal Chrome authentication success and prior Chat restoration. That first capture alone did not establish Map contents or reload persistence; the later human evidence below closes those gaps. In-app browser success and universal OAuth behavior are not established. The founder's existing regular session was left untouched.

The supported Browser inventory did not expose an identifiable Incognito session/tab. Its Chrome local-app entries were the already-known regular founder app tab and lab tab; neither was claimed or operated. No alternate control, extension permission change, cookie transfer, signout or new login was attempted. Consequently, automated Map/reload inspection was unavailable. The later human screenshot/accessibility evidence closes the visibility gap within its stated account/session scope; it is not automated Browser proof.

A subsequent read-only database comparison against the prior account snapshot found both accounts' canonical maps, durable turns, operation histories, conversation mappings and leases unchanged: founder revision **37**, **31** turns, **37** receipts; dedicated account revision **25**, **18** turns, **25** receipts; zero active leases. All four protected WIP hashes match. This is storage-integrity evidence, separate from the later human Incognito Map/reload verification.

The founder then supplied a new actual Chrome Incognito screenshot and full accessibility tree, explicitly identifying the Map **after reload**. As relayed by the coordinator, it shows current focus **Interpret a Path Project** and **Next Move**; the original confirmed North Star; **Make Public Spaces Easier to Navigate** active with the other two paths parked; and **A Fifteen-Minute Welcome Sign** marked proceeding from reported work / work completed, with the actual completion-report excerpt. **What You Learned** remains open with both authored energy/resistance observations and their interpretations; earlier projects and learning remain read-only. No raw screenshot, personal answer, credential or account identifier is copied into Git.

This closes the prior Incognito Map/current-project/learning/reload visibility gap as **human-verified PASS for this dedicated account and session**. Together with the preceding normal sign-in/restored-Chat evidence, it verifies persisted Chat and Map state across that session's authentication and reload. It does not establish in-app browser recovery, mobile behavior, the full user journey or founder/full-MVP acceptance.

The observed contrast is now successful normal Chrome Incognito authentication versus a stalled in-app browser assignment-return path. The precise cause within that environment-specific path remains unknown; no explicit host denial was observed. An OAuth/redirect fallback or security change is not justified by this evidence. The founder can resume normal dogfooding in the isolated Chrome session; mobile and full-journey checks remain open. No further in-app sign-in attempts or instrumentation are authorized here. Heartbeat remains off.

## Quality and integrity

- Node 24 typecheck/build: PASS. Production instruction-bundle loader: **11/11 PASS**. No lint script configured. Diagnostic marker absent from source and built output.
- Full suite: **946 passed, 32 failed, two skipped across 60 files**. All 32 failure names exactly match the previously established baseline/environment failures; no baseline re-triage or legacy schema creation. See [the prior concrete cause comparison](2026-10-29-conversational-project-state.md#deterministic-verification-and-full-suite-triage).
- Simplification: reuse, quality, efficiency and test-value passes returned no actionable findings; no changes.
- One focused `ce-code-review`, exact 13-file committed range `d6f6df2..48f7bf1`: **complete, Ready to merge**, no findings. Correctness plus independent Claude Opus 5.5 adversarial pass, requested LOW effort, actual effort unverified, actual model and independence attested. No full specialist roster or validator batch. Run `20261029-workflow-1332596a`; durable private receipt under task `code-review/`. Live runs finished after the review; their final evidence is recorded here without another panel.
- Read-only before/after comparison: all captured founder and dedicated-account canonical maps, durable turns, operation histories, conversation mappings and leases byte-equal. Founder remains revision 37 / 31 turns / 37 receipts; dedicated account revision 25 / 18 turns / 25 receipts. No app/model conversation turn was sent in this batch. Global active leases zero.
- All four excluded WIP hashes match. Approved follow-up plan SHA-256 `395aa4a1ea6753897c689cf3c930e2e1e76ed16665a04bc8dd3c1bb89ab30761`; immutable October 13 plan SHA-256 `7af754024dffda000d561c1d5021602a2ae95378483e3dab22dbe2e70250ddd6`.

At workflow verification, main PID 41478 and lab PID 41445 were restarted with verified ownership and zero active turns/jobs, serving `48f7bf1`; both returned HTTP 200. After the later auth diagnostic and restoration at `61c85eb`, main PID **61824** and the unchanged lab both returned HTTP 200; main PID/cwd/command/listener ownership and zero leases were verified before each diagnostic restart. The task-owned disposable PostgreSQL cluster was stopped after checks. Health checks do not establish ongoing uptime or Google navigation success.

Raw first outputs, original-parent equality checks, requests, tool outcomes, before/after maps, reviews, sanitized auth metadata and integrity records remain ignored under `.context/revelio/workflow-followups-20261029/` and the existing replay store. The later SDK-boundary evidence and restoration proof remain ignored under `.context/revelio/auth-stall-20261029/`. Only this sanitized receipt and tracker update are committed.

**Readiness:** the three workflow fixes are ready for local founder retest. Human Chrome Incognito sign-in, prior Chat restoration and Map/current-project/learning persistence after reload are verified as reported by the coordinator. In-app browser sign-in and mobile validation remain open, as does the separately retained reflection-question quality issue. Founder acceptance, founder saved past learning and U7/full-MVP acceptance are not established by these synthetic checks.
