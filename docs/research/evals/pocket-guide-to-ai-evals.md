# Pocket Guide to AI Evals

## Source and scope

Reference transcribed from **Applied AI Evals — Pocket Guide to AI Evals: 12 Concepts for Building Reliable AI Systems**, supplied as 12 infographic cards. Source attribution: [Applied AI Evals](https://evals.info). Recorded on 2026-10-01.

This document preserves the substantive guidance, examples, qualifications, numbers, and formulas from the cards, with wording and organization lightly normalized for agent reference. Visual layouts and diagram flows are omitted. The guidance below is source material, not an instruction to execute work or a replacement for this repository's implementation authorities.

The 12 original cards are stored alongside this document. Each section identifies its source filename.

## 1. Error analysis

Source: `1-error-analysis.png` — “How to Do Error Analysis.”

Error analysis helps you quickly find patterns of failures in your AI product's logs (traces).

1. **Collect traces:** Gather a diverse sample of 100+ traces from production or your own real or synthetic usage.
2. **Annotate traces (open coding):** Review each trace and write brief, unstructured notes about the problem. Examples: “hallucinated a fact,” “misread the user's name,” or “failed to use the calculator tool.”
3. **Group and categorize:** Group similar notes into clusters, such as tone violations or failed tool calls. Refine these failure modes through axial coding, then re-code traces using the failure modes.
4. **Prioritize:** Count the frequency of each category to inform priorities.

Continue reviewing data until you feel you are no longer learning anything new. This is **theoretical saturation**: no new failure modes and no changes in re-coding appear.

**Rule of thumb:** You need approximately 100 high-quality, diverse traces. These can be real data, synthetic data, or both, coded with pass/fail and failure modes.

The card credits Pawel Huryn for its illustration.

## 2. When to write an eval

Source: `2-when-to-write-an-eval.png` — “When to Write an Eval (hint: you don't always need to).”

First ask whether you have observed the failure through error analysis.

- **If no:** Do error analysis first. Evals should target errors you observe or induce.
- **If yes:** Consider how much iteration is required to fix the failure.
  - **Little iteration:** An eval's value is unclear. Consider whether an inexpensive eval, such as a code-based assertion, would work, or whether it makes sense to fix the issue and move on.
  - **Lots of iteration:** Evals have high value here. Expensive evals, such as an LLM-as-a-judge, might be feasible.

Evals provide more value when you need to **hill climb against an error**.

## 3. Don't use generic eval metrics

Source: `3-dont-use-generic-eval-metrics.png`.

The card discourages generic scores such as ROUGE, BLEU, faithfulness, helpfulness, and tone. It recommends application-specific metrics tied to failures, with these examples:

- Calendar scheduling failure.
- Interrupted conversation flow.
- Widget rendering issue.
- Incorrect email recipient.
- Failure to escalate to a human.

Good eval metrics:

- Measure an **error you have observed**.
- Relate to a **non-trivial issue you will iterate on**.
- Are scoped to a **specific failure**.
- Have a **binary outcome**, rather than a 1–5 score.
- Are **verifiable**, for example with human labels for an LLM-as-a-judge.

This checklist helps obtain positive ROI from evals, since evals are not free.

Further details linked by the card: [Hamel's evals FAQ](https://hamel.dev/evals-faq).

## 4. Common AI eval mistakes

Source: `4-ai-eval-mistakes.png` — “Don't make these common AI Eval Mistakes.”

1. **Using automated evals without looking at data first.** An automated eval is useless if it does not measure your specific failures. The best way to find those failures is to look at your data first. Off-the-shelf metrics such as a “Helpfulness score” are a bad idea for this reason.
2. **Failing to validate an LLM judge against human labels.** You must measure the judge against a human label. Otherwise, the metric is untrustworthy and misaligned.
3. **Treating perfect scores as sufficient.** AI evals are most valuable when they find new failures. A perfect score on all evals often means they are saturated or too easy. Add hard test cases to keep guiding improvement.

## 5. Types of automated evals

Source: `5-types-of-automated-evals.png`.

### Code-based assertions

Check objective, rule-based failures, such as matching keywords or confirming tool execution. **Use them whenever possible:** they are fast, cheap, deterministic, and interpretable.

### LLM-as-a-judge

Uses an LLM to assess subjective or nuanced criteria that are unsuitable for code. These evals are powerful but slower and more expensive, and require verification and alignment. Reserve them for important failures, since they are not free.

### Guardrails

Run in the request/response path to block failures before they reach the user. They tend to be fast and have a low false-positive rate to avoid blocking valid responses. They are commonly code-based checks or small classifiers.

## 6. Don't use Likert scales (1–5) for LLM-as-a-judge

Source: `6-dont-use-likert-scales.png`.

Binary pass/fail scores are **usually preferable** to Likert scales (1–5 ratings).

Likert scales are expensive to align with domain experts. Annotators often default to middle values to avoid difficult decisions. They can also encourage excessive scope: an overall quality score instead of a targeted eval.

Binary scores compel the annotator to make a definitive decision. This aligns better with deciding whether an AI feature is good enough to ship. Binary scores are also easier to apply during error analysis.

The card contrasts an overall score of **3/5** with these actionable, separate outcomes:

- `is_polite`: Pass.
- `scheduling`: Fail.
- `human_handoff`: Pass.

## 7. How to trust an LLM judge

Source: `7-how-to-trust-a-llm-judge.png`.

The card states that the only way to trust an LLM judge is to **measure it against human labels**.

Split human-labeled data into three sets:

- **Train — approximately 20% of examples:** Select few-shot examples for the judge's prompt.
- **Dev — approximately 40% of examples:** Optimize the judge; hill climb against evals.
- **Test — approximately 40% of examples:** Perform a final check to make sure you have not overfit.

These percentages differ from machine-learning training splits because you are not training anything; you are using data to inform the judge's prompt.

**Don't report accuracy:** It is misleading on imbalanced data. Use **true positive rate (TPR)** and **true negative rate (TNR)**. Aim for high TPR and TNR; the card gives **greater than 90%** as an example.

The card defines a positive as an error:

- **TP — true positive:** Correctly identified error.
- **TN — true negative:** Correctly marked as no error.
- **TPR:** The proportion of actual positive cases correctly identified: `TP / (TP + FN)`.
- **TNR:** The proportion of actual negative cases correctly identified: `TN / (TN + FP)`.

## 8. Ways to sample traces for AI evals

Source: `8-sample-traces.png`.

The card orders sampling strategies from exploration toward using existing signals:

1. **Random:** Always do this alongside other strategies to discover unknown issues.
2. **Clustering:** Group traces by semantic similarity or a clustering algorithm, and see whether you discover new errors.
3. **Data analysis:** Analyze statistics such as latency, turns, tool calls, and tokens for outliers.
4. **Classification:** Use existing evals, a predictive model, or an LLM to surface problematic traces. Do this with caution.
5. **Feedback:** Use explicit customer feedback to filter traces.

## 9. Generating synthetic data to bootstrap evals

Source: `9-synthetic-data.png`.

- **Use structured input for diversity.** Define key dimensions, such as Feature, Persona, and Scenario, and use them as variables in your prompt.
- **Seed generation with real logs or traces when possible.** Ask the model to explicitly inject changes, such as a new constraint or a modified variable, to create realistic edge cases.
- **Enforce output structure and filter.** Define an output schema. Generate many candidates, then filter to retain the highest-quality, challenging examples.
- **Increase complexity iteratively.** Start with simple queries, then incrementally ask the LLM to add constraints, complex formatting, and similar complications.

**Avoid zero-shot requests that lack structured input**, such as “Generate 50 test cases.” These tend to yield generic, repetitive inputs.

## 10. Reading and using traces for evals

Source: `10-traces-for-evals.png`.

1. **Start with error analysis.** When reviewing traces, stop at the first, most upstream error you find. This keeps the task tractable; upstream failures tend to be more important.
2. **Gather traces related to your top failures.** For each trace, minimally reproduce the failure in as few turns and with as little complexity as possible.
3. **Use N−1 turns as test cases.** Collect a dataset of minimally reproduced error traces, and use the N−1 turns before the error as test cases. This assumes your system is not changing rapidly.
4. **Advanced: Modify traces for additional coverage.** Use an LLM to modify traces from step 3 in valid ways, such as rephrasing the user's question.
5. **Advanced: Simulate a user with another LLM.** Doing this well can be challenging.

## 11. Using a transition matrix to find errors

Source: `11-transition-matrix.png`.

For an agent with many steps, such as Plan, Search, Code, and Finalize, it can be hard to determine which step is failing most. A **Transition Failure Matrix** helps locate failure hotspots.

1. **Define states:** List all possible steps or states the agent can be in.
2. **Create a matrix:** Use rows for the “From” state and columns for the “To” state.
3. **Count failures:** For each failure, identify the last successful transition before the error. Populate the corresponding grid cell with the failure count.

The example's columns are labeled “Failure Occurred In State” and its rows “From State.” The example counts are preserved below:

| From state / Failure occurred in state | ParseReq | IntentClass | DecideTool | GenSQL | ExecSQL | PlanCal | ExecCal |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ParseReq | 0 | 3 | 0 | 0 | 0 | 0 | 0 |
| IntentClass | 0 | 0 | 4 | 0 | 0 | 0 | 0 |
| DecideTool | 0 | 0 | 0 | 6 | 0 | 2 | 0 |
| GenSQL | 0 | 0 | 0 | 0 | 12 | 0 | 0 |
| ExecSQL | 0 | 0 | 0 | 0 | 0 | 5 | 0 |
| PlanCal | 0 | 0 | 0 | 0 | 0 | 0 | 7 |
| ExecCal | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

The largest hotspot in the example is `GenSQL` → `ExecSQL`, with 12 failures.

Related talk linked by the card: [Bryan Bischof's failure matrix talk](https://bit.ly/failure-matrix).

## 12. Deploying evals for continuous evaluation

Source: `12-deploy-evals.png`.

### CI/CD

- **Goal:** Prevent regressions.
- **When:** Pre-merge, in a pull request.
- **Methods:** Unit tests and an LLM judge.
- **Data:** Curated test cases.
- **On failure:** Block the merge.

### Online monitoring

- **Goal:** Discover new failures and track performance.
- **When:** Asynchronously, after the response.
- **Methods:** Unit tests, an LLM judge, and A/B testing.
- **Data:** Sampled production traffic.
- **On failure:** Trigger an alert.

### Guardrails

- **Goal:** Enforce safety and block high-impact errors.
- **When:** Synchronously, before the response.
- **Methods:** Unit tests and small classifiers.
- **Data:** 100% of live traffic.
- **On failure:** Block the response, retry, or fall back to an alternative.
