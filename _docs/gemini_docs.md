<gemini_api_quickstart>

Title: Gemini API quickstart

URL Source: https://ai.google.dev/gemini-api/docs/quickstart

Markdown Content:
Gemini API quickstart | Google AI for Developers
Gemini API quickstart
=====================

*   On this page
*   [Before you begin](https://ai.google.dev/gemini-api/docs/quickstart#before_you_begin)
*   [Install the Google GenAI SDK](https://ai.google.dev/gemini-api/docs/quickstart#install-gemini-library)
*   [Make your first request](https://ai.google.dev/gemini-api/docs/quickstart#make-first-request)
*   [What's next](https://ai.google.dev/gemini-api/docs/quickstart#what's-next)

This quickstart shows you how to install our [libraries](https://ai.google.dev/gemini-api/docs/libraries) and make your first Gemini API request.

**Note:** All our code snippets (except for direct REST calls) require and use **Google Gen AI SDK**, a new set of libraries we have been rolling out since late 2024. You can find out more about Google GenAI SDK and our previous libraries at our [Libraries](https://ai.google.dev/gemini-api/docs/libraries) page.
Before you begin
----------------

You need a Gemini API key. If you don't already have one, you can [get it for free in Google AI Studio](https://aistudio.google.com/app/apikey).

Install the Google Gen AI SDK
-----------------------------

[Python](https://ai.google.dev/gemini-api/docs/quickstart#python)[JavaScript](https://ai.google.dev/gemini-api/docs/quickstart#javascript)[Go](https://ai.google.dev/gemini-api/docs/quickstart#go)[Java](https://ai.google.dev/gemini-api/docs/quickstart#java)[Apps Script](https://ai.google.dev/gemini-api/docs/quickstart#apps-script)More

Using [Python 3.9+](https://www.python.org/downloads/), install the [`google-genai` package](https://pypi.org/project/google-genai/) using the following [pip command](https://packaging.python.org/en/latest/tutorials/installing-packages/):

```
pip install -q -U google-genai
```

Using [Node.js v18+](https://nodejs.org/en/download/package-manager), install the [Google Gen AI SDK for TypeScript and JavaScript](https://www.npmjs.com/package/@google/genai) using the following [npm command](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm):

```
npm install @google/genai
```

Install [google.golang.org/genai](https://pkg.go.dev/google.golang.org/genai) in your module directory using the [go get command](https://go.dev/doc/code):

```
go get google.golang.org/genai
```

If you're using Maven, you can install [google-genai](https://github.com/googleapis/java-genai) by adding the following to your dependencies:

```
<dependencies>
  <dependency>
    <groupId>com.google.genai</groupId>
    <artifactId>google-genai</artifactId>
    <version>1.0.0</version>
  </dependency>
</dependencies>
```

1.   To create a new Apps Script project, go to [script.new](https://script.google.com/u/0/home/projects/create).
2.   Click **Untitled project**.
3.   Rename the Apps Script project **AI Studio** and click **Rename**.
4.   Set your [API key](https://developers.google.com/apps-script/guides/properties#manage_script_properties_manually)
    1.   At the left, click **Project Settings**![Image 4: The icon for project settings](https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/settings/default/24px.svg).
    2.   Under **Script Properties** click **Add script property**.
    3.   For **Property**, enter the key name: `GEMINI_API_KEY`.
    4.   For **Value**, enter the value for the API key.
    5.   Click **Save script properties**.

5.   Replace the `Code.gs` file contents with the following code:

Make your first request
-----------------------

Use the [`generateContent`](https://ai.google.dev/api/generate-content#method:-models.generatecontent) method to send a request to the Gemini API.

[Python](https://ai.google.dev/gemini-api/docs/quickstart#python)[JavaScript](https://ai.google.dev/gemini-api/docs/quickstart#javascript)[Go](https://ai.google.dev/gemini-api/docs/quickstart#go)[Java](https://ai.google.dev/gemini-api/docs/quickstart#java)[Apps Script](https://ai.google.dev/gemini-api/docs/quickstart#apps-script)[REST](https://ai.google.dev/gemini-api/docs/quickstart#rest)More

```
from google import genai

client = genai.Client(api_key="YOUR_API_KEY")

response = client.models.generate_content(
    model="gemini-2.0-flash", contents="Explain how AI works in a few words"
)
print(response.text)
```

```
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: "YOUR_API_KEY" });

async function main() {
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: "Explain how AI works in a few words",
  });
  console.log(response.text);
}

main();
```

```
package main

import (
    "context"
    "fmt"
    "log"

    "google.golang.org/genai"
)

func main() {
    ctx := context.Background()
    client, err := genai.NewClient(ctx, &genai.ClientConfig{
        APIKey:  "YOUR_API_KEY",
        Backend: genai.BackendGeminiAPI,
    })
    if err != nil {
        log.Fatal(err)
    }

    result, err := client.Models.GenerateContent(
        ctx,
        "gemini-2.0-flash",
        genai.Text("Explain how AI works in a few words"),
        nil,
    )
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println(result.Text())
}
```

```
package com.example;

import com.google.genai.Client;
import com.google.genai.types.GenerateContentResponse;

public class GenerateTextFromTextInput {
  public static void main(String[] args) {
    // The client gets the API key from the environment variable `GOOGLE_API_KEY`.
    Client client = new Client();

    GenerateContentResponse response =
        client.models.generateContent(
            "gemini-2.0-flash",
            "Explain how AI works in a few words",
            null);

    System.out.println(response.text());
  }
}
```

```
// See https://developers.google.com/apps-script/guides/properties
// for instructions on how to set the API key.
const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
function main() {
  const payload = {
    contents: [
      {
        parts: [
          { text: 'Explain how AI works in a few words' },
        ],
      },
    ],
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const options = {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  };

  const response = UrlFetchApp.fetch(url, options);
  const data = JSON.parse(response);
  const content = data['candidates'][0]['content']['parts'][0]['text'];
  console.log(content);
}
```

```
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=$YOUR_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "contents": [
      {
        "parts": [
          {
            "text": "Explain how AI works in a few words"
          }
        ]
      }
    ]
  }'
```

</gemini_api_quickstart>

<flash_details>
|Property|Description|
|---|---|
|id_cardModel code|`models/gemini-2.5-flash`|
|saveSupported data types|**Inputs**<br><br>Text, images, video, audio<br><br>**Output**<br><br>Text|
|token_autoToken limits[[*]](https://ai.google.dev/gemini-api/docs/models#token-size)|**Input token limit**<br><br>1,048,576<br><br>**Output token limit**<br><br>65,536|
|handymanCapabilities|**Audio generation**<br><br>Not supported<br><br>**Caching**<br><br>Supported<br><br>**Code execution**<br><br>Supported<br><br>**Function calling**<br><br>Supported<br><br>**Image generation**<br><br>Not supported<br><br>**Search grounding**<br><br>Supported<br><br>**Structured outputs**<br><br>Supported<br><br>**Thinking**<br><br>Supported<br><br>**Tuning**<br><br>Not supported|
|123Versions|Read the [model version patterns](https://ai.google.dev/gemini-api/docs/models/gemini#model-versions) for more details.<br><br>- Stable: `gemini-2.5-flash`<br>- Preview: `gemini-2.5-flash-preview-05-20`|
|calendar_monthLatest update|June 2025|
|cognition_2Knowledge cutoff|January 2025|

</flash_details>

<grounding_docs>
Title: Grounding with Google Search

URL Source: https://ai.google.dev/gemini-api/docs/grounding?lang=python

Markdown Content:
The Grounding with Google Search feature in the Gemini API and AI Studio can be used to improve the accuracy and recency of responses from the model. In addition to more factual responses, when Grounding with Google Search is enabled, the Gemini API returns grounding sources (in-line supporting links) and [Google Search Suggestions](https://ai.google.dev/gemini-api/docs/grounding?lang=python#search-suggestions) along with the response content. The Search Suggestions point users to the search results corresponding to the grounded response.

This guide will help you get started with Grounding with Google Search.

### Before you begin

Before calling the Gemini API, ensure you have [your SDK of choice](https://ai.google.dev/gemini-api/docs/downloads) installed, and a [Gemini API key](https://ai.google.dev/gemini-api/docs/api-key) configured and ready to use.

Configure Search Grounding
--------------------------

Starting with Gemini 2.0, Google Search is available as a tool. This means that the model can decide when to use Google Search. The following example shows how to configure Search as a tool.

```
from google import genai
from google.genai.types import Tool, GenerateContentConfig, GoogleSearch

client = genai.Client()
model_id = "gemini-2.0-flash"

google_search_tool = Tool(
    google_search = GoogleSearch()
)

response = client.models.generate_content(
    model=model_id,
    contents="When is the next total solar eclipse in the United States?",
    config=GenerateContentConfig(
        tools=[google_search_tool],
        response_modalities=["TEXT"],
    )
)

for each in response.candidates[0].content.parts:
    print(each.text)
# Example response:
# The next total solar eclipse visible in the contiguous United States will be on ...

# To get grounding metadata as web content.
print(response.candidates[0].grounding_metadata.search_entry_point.rendered_content)
```

The Search-as-a-tool functionality also enables multi-turn searches. Combining Search with function calling is not yet supported.

Search as a tool enables complex prompts and workflows that require planning, reasoning, and thinking:

*   Grounding to enhance factuality and recency and provide more accurate answers
*   Retrieving artifacts from the web to do further analysis on
*   Finding relevant images, videos, or other media to assist in multimodal reasoning or generation tasks
*   Coding, technical troubleshooting, and other specialized tasks
*   Finding region-specific information or assisting in translating content accurately
*   Finding relevant websites for further browsing

Grounding with Google Search works with all [available languages](https://ai.google.dev/gemini-api/docs/models/gemini#available-languages) when doing text prompts. On the paid tier of the Gemini Developer API, you can get 1,500 Grounding with Google Search queries per day for free, with additional queries billed at the standard $35 per 1,000 queries.

You can learn more by [trying the Search tool notebook](https://colab.research.google.com/github/google-gemini/cookbook/blob/main/quickstarts/Search_Grounding.ipynb).

Google Search Suggestions
-------------------------

To use Grounding with Google Search, you have to display Google Search Suggestions, which are suggested queries included in the metadata of the grounded response. To learn more about the display requirements, see [Use Google Search Suggestions](https://ai.google.dev/gemini-api/docs/grounding/search-suggestions).

Google Search retrieval
-----------------------

To configure a model to use Google Search retrieval, pass in the appropriate tool.

Note that Google Search retrieval is only compatible with the 1.5 models, later models need to use the [Search Grounding](https://ai.google.dev/gemini-api/docs/grounding?lang=python#grounding). If you try to use it, the SDK will convert your code to use the Search Grounding instead and will ignore the dynamic threshold settings.

### Getting started

```
from google import genai
from google.genai import types

client = genai.Client(api_key="GEMINI_API_KEY")

response = client.models.generate_content(
    model='gemini-1.5-flash',
    contents="Who won the US open this year?",
    config=types.GenerateContentConfig(
        tools=[types.Tool(
            google_search_retrieval=types.GoogleSearchRetrieval()
        )]
    )
)
print(response)
```

### Dynamic threshold

The `dynamic_threshold` settings let you control the [retrieval behavior](https://ai.google.dev/gemini-api/docs/grounding?lang=python#dynamic-retrieval), giving you additional control over when Grounding with Google Search is used.

```
from google import genai
from google.genai import types

client = genai.Client(api_key="GEMINI_API_KEY")

response = client.models.generate_content(
    model='gemini-1.5-flash',
    contents="Who won Roland Garros this year?",
    config=types.GenerateContentConfig(
        tools=[types.Tool(
            google_search_retrieval=types.GoogleSearchRetrieval(
                dynamic_retrieval_config=types.DynamicRetrievalConfig(
                    mode=types.DynamicRetrievalConfigMode.MODE_DYNAMIC,
                    dynamic_threshold=0.6))
        )]
    )
)
print(response)
```

### Dynamic retrieval

Some queries are likely to benefit more from Grounding with Google Search than others. The _dynamic retrieval_ feature gives you additional control over when to use Grounding with Google Search.

If the dynamic retrieval mode is unspecified, Grounding with Google Search is always triggered. If the mode is set to dynamic, the model decides when to use grounding based on a threshold that you can configure. The threshold is a floating-point value in the range [0,1] and defaults to 0.3. If the threshold value is 0, the response is always grounded with Google Search; if it's 1, it never is.

#### How dynamic retrieval works

You can use dynamic retrieval in your request to choose when to turn on Grounding with Google Search. This is useful when the prompt doesn't require an answer grounded in Google Search and the model can provide an answer based on its own knowledge without grounding. This helps you manage latency, quality, and cost more effectively.

Before you invoke the dynamic retrieval configuration in your request, understand the following terminology:

*   **Prediction score**: When you request a grounded answer, Gemini assigns a _prediction score_ to the prompt. The prediction score is a floating point value in the range [0,1]. Its value depends on whether the prompt can benefit from grounding the answer with the most up-to-date information from Google Search. Thus, if a prompt requires an answer grounded in the most recent facts on the web, it has a higher prediction score. A prompt for which a model-generated answer is sufficient has a lower prediction score.

Here are examples of some prompts and their prediction scores.

| Prompt | Prediction score | Comment |
| --- | --- | --- |
| "Write a poem about peonies" | 0.13 | The model can rely on its knowledge and the answer doesn't need grounding. |
| "Suggest a toy for a 2yo child" | 0.36 | The model can rely on its knowledge and the answer doesn't need grounding. |
| "Can you give a recipe for an asian-inspired guacamole?" | 0.55 | Google Search can give a grounded answer, but grounding isn't strictly required; the model knowledge might be sufficient. |
| "What's Agent Builder? How is grounding billed in Agent Builder?" | 0.72 | Requires Google Search to generate a well-grounded answer. |
| "Who won the latest F1 grand prix?" | 0.97 | Requires Google Search to generate a well-grounded answer. | 
*   **Threshold**: In your API request, you can specify a dynamic retrieval configuration with a threshold. The threshold is a floating point value in the range [0,1] and defaults to 0.3. If the threshold value is zero, the response is always grounded with Google Search. For all other values of threshold, the following is applicable:

    *   If the prediction score is greater than or equal to the threshold, the answer is grounded with Google Search. A lower threshold implies that more prompts have responses that are generated using Grounding with Google Search.
    *   If the prediction score is less than the threshold, the model might still generate the answer, but it isn't grounded with Google Search.

To learn how to set the dynamic retrieval threshold using an SDK or the REST API, see the appropriate [code example](https://ai.google.dev/gemini-api/docs/grounding?lang=python#configure-grounding).

To find a good threshold that suits your business needs, you can create a representative set of queries that you expect to encounter. Then you can sort the queries according to the prediction score in the response and select a good threshold for your use case.

A grounded response
-------------------

If your prompt successfully grounds to Google Search, the response will include `groundingMetadata`. A grounded response might look something like this (parts of the response have been omitted for brevity):

```
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "text": "Carlos Alcaraz won the Gentlemen's Singles title at the 2024 Wimbledon Championships. He defeated Novak Djokovic in the final, winning his second consecutive Wimbledon title and fourth Grand Slam title overall. \n"
          }
        ],
        "role": "model"
      },
      ...
      "groundingMetadata": {
        "searchEntryPoint": {
          "renderedContent": "\u003cstyle\u003e\n.container {\n  align-items: center;\n  border-radius: 8px;\n  display: flex;\n  font-family: Google Sans, Roboto, sans-serif;\n  font-size: 14px;\n  line-height: 20px;\n  padding: 8px 12px;\n}\n.chip {\n  display: inline-block;\n  border: solid 1px;\n  border-radius: 16px;\n  min-width: 14px;\n  padding: 5px 16px;\n  text-align: center;\n  user-select: none;\n  margin: 0 8px;\n  -webkit-tap-highlight-color: transparent;\n}\n.carousel {\n  overflow: auto;\n  scrollbar-width: none;\n  white-space: nowrap;\n  margin-right: -12px;\n}\n.headline {\n  display: flex;\n  margin-right: 4px;\n}\n.gradient-container {\n  position: relative;\n}\n.gradient {\n  position: absolute;\n  transform: translate(3px, -9px);\n  height: 36px;\n  width: 9px;\n}\n@media (prefers-color-scheme: light) {\n  .container {\n    background-color: #fafafa;\n    box-shadow: 0 0 0 1px #0000000f;\n  }\n  .headline-label {\n    color: #1f1f1f;\n  }\n  .chip {\n    background-color: #ffffff;\n    border-color: #d2d2d2;\n    color: #5e5e5e;\n    text-decoration: none;\n  }\n  .chip:hover {\n    background-color: #f2f2f2;\n  }\n  .chip:focus {\n    background-color: #f2f2f2;\n  }\n  .chip:active {\n    background-color: #d8d8d8;\n    border-color: #b6b6b6;\n  }\n  .logo-dark {\n    display: none;\n  }\n  .gradient {\n    background: linear-gradient(90deg, #fafafa 15%, #fafafa00 100%);\n  }\n}\n@media (prefers-color-scheme: dark) {\n  .container {\n    background-color: #1f1f1f;\n    box-shadow: 0 0 0 1px #ffffff26;\n  }\n  .headline-label {\n    color: #fff;\n  }\n  .chip {\n    background-color: #2c2c2c;\n    border-color: #3c4043;\n    color: #fff;\n    text-decoration: none;\n  }\n  .chip:hover {\n    background-color: #353536;\n  }\n  .chip:focus {\n    background-color: #353536;\n  }\n  .chip:active {\n    background-color: #464849;\n    border-color: #53575b;\n  }\n  .logo-light {\n    display: none;\n  }\n  .gradient {\n    background: linear-gradient(90deg, #1f1f1f 15%, #1f1f1f00 100%);\n  }\n}\n\u003c/style\u003e\n\u003cdiv class=\"container\"\u003e\n  \u003cdiv class=\"headline\"\u003e\n    \u003csvg class=\"logo-light\" width=\"18\" height=\"18\" viewBox=\"9 9 35 35\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"\u003e\n      \u003cpath fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M42.8622 27.0064C42.8622 25.7839 42.7525 24.6084 42.5487 23.4799H26.3109V30.1568H35.5897C35.1821 32.3041 33.9596 34.1222 32.1258 35.3448V39.6864H37.7213C40.9814 36.677 42.8622 32.2571 42.8622 27.0064V27.0064Z\" fill=\"#4285F4\"/\u003e\n      \u003cpath fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M26.3109 43.8555C30.9659 43.8555 34.8687 42.3195 37.7213 39.6863L32.1258 35.3447C30.5898 36.3792 28.6306 37.0061 26.3109 37.0061C21.8282 37.0061 18.0195 33.9811 16.6559 29.906H10.9194V34.3573C13.7563 39.9841 19.5712 43.8555 26.3109 43.8555V43.8555Z\" fill=\"#34A853\"/\u003e\n      \u003cpath fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M16.6559 29.8904C16.3111 28.8559 16.1074 27.7588 16.1074 26.6146C16.1074 25.4704 16.3111 24.3733 16.6559 23.3388V18.8875H10.9194C9.74388 21.2072 9.06992 23.8247 9.06992 26.6146C9.06992 29.4045 9.74388 32.022 10.9194 34.3417L15.3864 30.8621L16.6559 29.8904V29.8904Z\" fill=\"#FBBC05\"/\u003e\n      \u003cpath fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M26.3109 16.2386C28.85 16.2386 31.107 17.1164 32.9095 18.8091L37.8466 13.8719C34.853 11.082 30.9659 9.3736 26.3109 9.3736C19.5712 9.3736 13.7563 13.245 10.9194 18.8875L16.6559 23.3388C18.0195 19.2636 21.8282 16.2386 26.3109 16.2386V16.2386Z\" fill=\"#EA4335\"/\u003e\n    \u003c/svg\u003e\n    \u003csvg class=\"logo-dark\" width=\"18\" height=\"18\" viewBox=\"0 0 48 48\" xmlns=\"http://www.w3.org/2000/svg\"\u003e\n      \u003ccircle cx=\"24\" cy=\"23\" fill=\"#FFF\" r=\"22\"/\u003e\n      \u003cpath d=\"M33.76 34.26c2.75-2.56 4.49-6.37 4.49-11.26 0-.89-.08-1.84-.29-3H24.01v5.99h8.03c-.4 2.02-1.5 3.56-3.07 4.56v.75l3.91 2.97h.88z\" fill=\"#4285F4\"/\u003e\n      \u003cpath d=\"M15.58 25.77A8.845 8.845 0 0 0 24 31.86c1.92 0 3.62-.46 4.97-1.31l4.79 3.71C31.14 36.7 27.65 38 24 38c-5.93 0-11.01-3.4-13.45-8.36l.17-1.01 4.06-2.85h.8z\" fill=\"#34A853\"/\u003e\n      \u003cpath d=\"M15.59 20.21a8.864 8.864 0 0 0 0 5.58l-5.03 3.86c-.98-2-1.53-4.25-1.53-6.64 0-2.39.55-4.64 1.53-6.64l1-.22 3.81 2.98.22 1.08z\" fill=\"#FBBC05\"/\u003e\n      \u003cpath d=\"M24 14.14c2.11 0 4.02.75 5.52 1.98l4.36-4.36C31.22 9.43 27.81 8 24 8c-5.93 0-11.01 3.4-13.45 8.36l5.03 3.85A8.86 8.86 0 0 1 24 14.14z\" fill=\"#EA4335\"/\u003e\n    \u003c/svg\u003e\n    \u003cdiv class=\"gradient-container\"\u003e\u003cdiv class=\"gradient\"\u003e\u003c/div\u003e\u003c/div\u003e\n  \u003c/div\u003e\n  \u003cdiv class=\"carousel\"\u003e\n    \u003ca class=\"chip\" href=\"https://vertexaisearch.cloud.google.com/grounding-api-redirect/AWhgh4x8Epe-gzpwRBvp7o3RZh2m1ygq1EHktn0OWCtvTXjad4bb1zSuqfJd6OEuZZ9_SXZ_P2SvCpJM7NaFfQfiZs6064MeqXego0vSbV9LlAZoxTdbxWK1hFeqTG6kA13YJf7Fbu1SqBYM0cFM4zo0G_sD9NKYWcOCQMvDLDEJFhjrC9DM_QobBIAMq-gWN95G5tvt6_z6EuPN8QY=\"\u003ewho won wimbledon 2024\u003c/a\u003e\n  \u003c/div\u003e\n\u003c/div\u003e\n"
        },
        "groundingChunks": [
          {
            "web": {
              "uri": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AWhgh4whET1ta3sDETZvcicd8FeNe4z0VuduVsxrT677KQRp2rYghXI0VpfYbIMVI3THcTuMwggRCbFXS_wVvW0UmGzMe9h2fyrkvsnQPJyikJasNIbjJLPX0StM4Bd694-ZVle56MmRA4YiUvwSqad1w6O2opmWnw==",
              "title": "wikipedia.org"
            }
          },
          {
            "web": {
              "uri": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AWhgh4wR1M-9-yMPUr_KdHlnoAmQ8ZX90DtQ_vDYTjtP2oR5RH4tRP04uqKPLmesvo64BBkPeYLC2EpVDxv9ngO3S1fs2xh-e78fY4m0GAtgNlahUkm_tBm_sih5kFPc7ill9u2uwesNGUkwrQlmP2mfWNU5lMMr23HGktr6t0sV0QYlzQq7odVoBxYWlQ_sqWFH",
              "title": "wikipedia.org"
            }
          },
          {
            "web": {
              "uri": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AWhgh4wsDmROzbP-tmt8GdwCW_pqISTZ4IRbBuoaMyaHfcQg8WW-yKRQQvMDTPAuLxJh-8_U8_iw_6JKFbQ8M9oVYtaFdWFK4gOtL4RrC9Jyqc5BNpuxp6uLEKgL5-9TggtNvO97PyCfziDFXPsxylwI1HcfQdrz3Jy7ZdOL4XM-S5rC0lF2S3VWW0IEAEtS7WX861meBYVjIuuF_mIr3spYPqWLhbAY2Spj-4_ba8DjRvmevIFUhRuESTKvBfmpxNSM",
              "title": "cbssports.com"
            }
          },
          {
            "web": {
              "uri": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AWhgh4yzjLkorHiUKjhOPkWaZ9b4cO-cLG-02vlEl6xTBjMUjyhK04qSIclAa7heR41JQ6AAVXmNdS3WDrLOV4Wli-iezyzW8QPQ4vgnmO_egdsuxhcGk3-Fp8-yfqNLvgXFwY5mPo6QRhvplOFv0_x9mAcka18QuAXtj0SPvJfZhUEgYLCtCrucDS5XFc5HmRBcG1tqFdKSE1ihnp8KLdaWMhrUQI21hHS9",
              "title": "jagranjosh.com"
            }
          },
          {
            "web": {
              "uri": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AWhgh4y9L4oeNGWCatFz63b9PpP3ys-Wi_zwnkUT5ji9lY7gPUJQcsmmE87q88GSdZqzcx5nZG9usot5FYk2yK-FAGvCRE6JsUQJB_W11_kJU2HVV1BTPiZ4SAgm8XDFIxpCZXnXmEx5HUfRqQm_zav7CvS2qjA2x3__qLME6Jy7R5oza1C5_aqjQu422le9CaigThS5bvJoMo-ZGcXdBUCj2CqoXNVjMA==",
              "title": "apnews.com"
            }
          }
        ],
        "groundingSupports": [
          {
            "segment": {
              "endIndex": 85,
              "text": "Carlos Alcaraz won the Gentlemen's Singles title at the 2024 Wimbledon Championships."
            },
            "groundingChunkIndices": [
              0,
              1,
              2,
              3
            ],
            "confidenceScores": [
              0.97380733,
              0.97380733,
              0.97380733,
              0.97380733
            ]
          },
          {
            "segment": {
              "startIndex": 86,
              "endIndex": 210,
              "text": "He defeated Novak Djokovic in the final, winning his second consecutive Wimbledon title and fourth Grand Slam title overall."
            },
            "groundingChunkIndices": [
              1,
              0,
              4
            ],
            "confidenceScores": [
              0.96145374,
              0.96145374,
              0.96145374
            ]
          }
        ],
        "webSearchQueries": [
          "who won wimbledon 2024"
        ]
      }
    }
  ],
  ...
}
```

If the response doesn't include `groundingMetadata`, this means the response wasn't successfully grounded. There are several reasons this could happen, including low source relevance or incomplete information within the model response.

When a grounded result is generated, the metadata contains URIs that redirect to the publishers of the content that was used to generate the grounded result. These URIs contain the `vertexaisearch` subdomain, as in this truncated example: `https://vertexaisearch.cloud.google.com/grounding-api-redirect/...`. The metadata also contains the publishers' domains. The provided URIs remain accessible for 30 days after the grounded result is generated.

The `renderedContent` field within `searchEntryPoint` is the provided code for implementing Google Search Suggestions. See [Use Google Search Suggestions](https://ai.google.dev/gemini-api/docs/grounding/search-suggestions) to learn more.

URL context tool
----------------

The URL context tool lets you augment your prompts with URLs that provide more context and details to the model about the task you want to perform. Used in conjunction with Grounding with Google Search, it simplifies the workflow for tasks that require both broad discovery and in-depth understanding. You can provide instructions in your prompt and the model can execute a Google Search, analyze the sites found, and use that analysis to complete the task given in your prompt.

For more details and code samples, see the [URL context tool](https://ai.google.dev/gemini-api/docs/url-context) overview page.
</grounding_docs>

<prompting_guide>
Title: Prompt design strategies

URL Source: https://ai.google.dev/gemini-api/docs/prompting-strategies

Markdown Content:
_Prompt design_ is the process of creating prompts, or natural language requests, that elicit accurate, high quality responses from a language model.

This page introduces basic concepts, strategies, and best practices to get you started designing prompts to get the most out of Gemini AI models.

Topic-specific prompt guides
----------------------------

Looking for more specific prompt strategies? Check out our other prompting guides on:

*   [Prompting with media files](https://ai.google.dev/gemini-api/docs/files#prompt-guide)
*   [Prompting for image generation](https://ai.google.dev/gemini-api/docs/image-generation#imagen-prompt-guide)
*   [Prompting for video generation](https://ai.google.dev/gemini-api/docs/video#prompt-guide)

Google AI Studio also hosts a [prompt gallery](https://aistudio.google.com/app/gallery) meant to interactively showcase many of the concepts shared in this guide.

Clear and specific instructions
-------------------------------

An effective and efficient way to customize model behavior is to provide it with clear and specific instructions. Instructions can be in the form of a question, step-by-step tasks, or as complex as mapping out a user's experience and mindset.

### Input

Input is the required text in the prompt that you want the model to provide a response to. Inputs can be a question that the model answers (question input), a task the model performs (task input), an entity the model operates on (entity input), or partial input that the model completes or continues (completion input).

| **Input type** | **Prompt** | **Generated output** |
| --- | --- | --- |
| Question | ``` What's a good name for a flower shop that specializes in selling bouquets of dried flowers? Create a list of 5 options with just the names. ``` | ``` Here are 10 names for a flower shop specializing in dried flowers: 1. Everlasting Blooms 2. Dried & Delightful 3. The Petal Preserve 4. Whispers of Wildflowers 5. Forever Blooms ``` |
| Task | Give me a simple list of just the things that I must bring on a camping trip. The list should have 5 items. | 1. **Tent:** Your shelter from the elements. 2. **Sleeping Bag:** Stay warm and comfortable. 3. **Sleeping Pad:** Insulation and cushioning for a good night's sleep. 4. **Headlamp or Flashlight:** Light for nighttime activities. 5. **First Aid Kit:** Be prepared for minor injuries. |
| Entity | ``` Classify the following items as [large, small]: Elephant Mouse Snail ``` | ``` Here's the classification: * **Elephant:** Large * **Mouse:** Small * **Snail:** Small ``` |

#### Partial input completion

Generative language models work like an advanced auto completion tool. When you provide partial content, the model can provide the rest of the content or what it thinks is a continuation of that content as a response. When doing so, if you include any examples or context, the model can take those examples or context into account.

The following example provides a prompt with an instruction and an entity input:

**Prompt:** For the given order, return a JSON object that has the fields cheeseburger, hamburger, fries, or
drink, with the value being the quantity.

Order: A burger and a drink.
  **Response:** {
  "cheeseburger": 0,
  "hamburger": 1,
  "fries": 0,
  "drink": 1
}
  (gemini-2.5-flash) 

While the model did as prompted, writing out the instructions in natural language can sometimes be challenging and it leaves a lot to the model's interpretation. For example, a restaurants menu might contain many items. To reduce the size of the JSON response, you probably want to omit the items that weren't ordered. In this case, you can give an example and a [response prefix](https://ai.google.dev/gemini-api/docs/prompting-strategies#prefixes) and let the model complete it:

**Prompt:** Valid fields are cheeseburger, hamburger, fries, and drink.
Order: Give me a cheeseburger and fries
Output:
```
{
  "cheeseburger": 1,
  "fries": 1
}
```
Order: I want two burgers, a drink, and fries.
Output:
  **Response:** ```
{
  "hamburger": 2,
  "drink": 1,
  "fries": 1
}
```
  (gemini-2.5-flash) 

Notice how "cheeseburger" was excluded from the output because it wasn't a part of the order.

### Constraints

Specify any constraints on reading the prompt or generating a response. You can tell the model what to do and not to do. For example, you can specify a constraint in the prompt on how long you want a summary to be:

**Prompt:**

**Summarize this text in one sentence:**
Text: A quantum computer exploits quantum mechanical phenomena to perform calculations exponentially
faster than any modern traditional computer. At very tiny scales, physical matter acts as both
particles and as waves, and quantum computing uses specialized hardware to leverage this behavior.
The operating principles of quantum devices is beyond the scope of classical physics. When deployed
at scale, quantum computers could be used in a wide variety of applications such as: in
cybersecurity to break existing encryption methods while helping researchers create new ones, in
meteorology to develop better weather forecasting etc. However, the current state of the art quantum
computers are still largely experimental and impractical.
    
**Response:**

      Exploiting quantum mechanical phenomena, quantum computers can perform calculations exponentially faster than traditional computers for potential applications like cybersecurity and meteorology, although they are currently largely experimental and impractical.
    (gemini-2.5-flash) 

### Response format

You can give instructions that specify the format of the response. For example, you can ask for the response to be formatted as a table, bulleted list, elevator pitch, keywords, sentence, or paragraph. The following system instruction tells the model to be more conversational in its response:

**System instruction**     All questions should be answered comprehensively with details, unless the user requests a concise response specifically.
  **Prompt**     What is a smart way to make a business that sells DVD's in 2025?
  **Response:** Starting a business selling DVDs in 2025 presents significant challenges due to the overwhelming dominance of digital streaming and on-demand services; a "smart" approach would therefore require a highly specialized niche, a strong value proposition beyond just the disc, and likely a focus on community or collector markets rather than mainstream consumption.

Here's a breakdown of what a smart DVD business in 2025 would likely entail:

1. Extreme Niche Specialization: You cannot compete with streaming libraries. Your business must focus on what digital doesn't offer easily or at all. This could include:

    * Out-of-Print & Rare Titles: Sourcing films or TV shows that have never been released digitally or are currently unavailable on major streaming platforms.
    ....
  (gemini-2.5-flash) 

#### Format responses with the completion strategy

The [completion strategy](https://ai.google.dev/gemini-api/docs/prompting-strategies#completion) can also help format the response. The following example prompts the model to create an essay outline:

**Prompt:** Create an outline for an essay about hummingbirds.
  **Response:** Here is a possible outline for an essay about hummingbirds:

I. Introduction
A. Hook: Start with a captivating fact or description about hummingbirds (e.g., their speed, iridescent colors, or tiny size).
B. Background: Briefly introduce hummingbirds – where they are found (Americas), their reputation as unique birds.
C. Thesis Statement: State the main point of the essay, which could be about the remarkable adaptations, behaviors, and ecological importance of hummingbirds.

II. Appearance and Identification
.....
  (gemini-2.5-flash) 

The prompt didn't specify the format for the outline and the model chose a format for you. To get the model to return an outline in a specific format, you can add text that represents the start of the outline and let the model complete it based on the pattern that you initiated.

**Prompt:** Create an outline for an essay about hummingbirds.
I. Introduction
   *
  **Response:** Okay, here is an outline for an essay about hummingbirds, starting from the introduction you provided:

I. Introduction
* Hook: Start with a captivating fact or description about hummingbirds (e.g., their speed, iridescent colors, or tiny size).
* Background: Briefly introduce hummingbirds – where they are found (Americas), their reputation as unique birds, and their general characteristics.
* Thesis Statement: State the main point of the essay, focusing on the remarkable adaptations, behaviors, and ecological significance that make hummingbirds extraordinary.
.....
  (gemini-2.5-flash) 

Zero-shot vs few-shot prompts
-----------------------------

You can include examples in the prompt that show the model what getting it right looks like. The model attempts to identify patterns and relationships from the examples and applies them when generating a response. Prompts that contain a few examples are called _few-shot_ prompts, while prompts that provide no examples are called _zero-shot_ prompts. Few-shot prompts are often used to regulate the formatting, phrasing, scoping, or general patterning of model responses. Use specific and varied examples to help the model narrow its focus and generate more accurate results.

We recommend to always include few-shot examples in your prompts. Prompts without few-shot examples are likely to be less effective. In fact, you can remove instructions from your prompt if your examples are clear enough in showing the task at hand.

The following zero-shot prompt asks the model to choose the best explanation.

**Prompt:** Please choose the best explanation to the question:

Question: How is snow formed?
Explanation1: Snow is formed when water vapor in the air freezes into ice
crystals in the atmosphere, which can combine and grow into snowflakes as they
fall through the atmosphere and accumulate on the ground.
Explanation2: Water vapor freezes into ice crystals forming snow.
Answer:
  **Response:** Explanation1 is the better explanation because it provides more detail on the
process, including how ice crystals combine and grow into snowflakes as they
fall through the atmosphere.
  (gemini-2.5-flash) 

If your use case requires the model to produce concise responses, you can include examples in the prompt that give preference to concise responses.

The following prompt provides two examples that show preference to the shorter explanations. In the response, you can see that the examples guided the model to choose the shorter explanation (`Explanation2`) as opposed to the longer explanation (`Explanation1`) like it did previously.

**Prompt:** Below are some examples showing a question, explanation, and answer format:

Question: Why is the sky blue?
Explanation1: The sky appears blue because of Rayleigh scattering, which causes
shorter blue wavelengths of light to be scattered more easily than longer red
wavelengths, making the sky look blue.
Explanation2: Due to Rayleigh scattering effect.
Answer: Explanation2

Question: What is the cause of earthquakes?
Explanation1: Sudden release of energy in the Earth's crust.
Explanation2: Earthquakes happen when tectonic plates suddenly slip or break
apart, causing a release of energy that creates seismic waves that can shake the
ground and cause damage.
Answer: Explanation1

Now, Answer the following question given the example formats above:

Question: How is snow formed?
Explanation1: Snow is formed when water vapor in the air freezes into ice
crystals in the atmosphere, which can combine and grow into snowflakes as they
fall through the atmosphere and accumulate on the ground.
Explanation2: Water vapor freezes into ice crystals forming snow.
Answer:
  **Response:** Answer: Explanation2
  (gemini-2.5-flash) 

### Optimal number of examples

Models like Gemini can often pick up on patterns using a few examples, though you may need to experiment with the number of examples to provide in the prompt for the best results. At the same time, if you include too many examples, the model may start to [overfit](https://developers.google.com/machine-learning/glossary#overfitting) the response to the examples.

### Patterns vs anti patterns

Using examples to show the model a pattern to follow is more effective than using examples to show the model an anti pattern to avoid.

⛔ **Negative pattern:**

**Example** Don't end haikus with a question:
Haiku are fun
A short and simple poem
Don't you enjoy them?
  

✅ **Positive pattern:**

**Example** Always end haikus with an assertion:
Haiku are fun
A short and simple poem
A joy to write
  

### Consistent formatting

Make sure that the structure and formatting of few-shot examples are the same to avoid responses with undesired formats. One of the primary objectives of adding few-shot examples in prompts is to show the model the response format. Therefore, it is essential to ensure a consistent format across all examples, especially paying attention to XML tags, white spaces, newlines, and example splitters.

Add context
-----------

You can include instructions and information in a prompt that the model needs to solve a problem, instead of assuming that the model has all of the required information. This contextual information helps the model understand the constraints and details of what you're asking for it to do.

The following example asks the model to give troubleshooting guidance for a router:

**Prompt:** What should I do to fix my disconnected wifi? **The light on my Google Wifi router is yellow and blinking slowly.**
  **Response:**   A yellow blinking light on your Google Wifi router usually indicates a problem
  with the internet connection. Here are some steps to troubleshoot and fix the
  issue:
  1. Restart your router and modem:
    - Unplug your modem from the power outlet and wait for 30 seconds.
    - Plug your modem back in and wait for it to fully boot up.
    - Unplug your Google Wifi router and wait for 30 seconds.
    - Plug your Google Wifi router back in and wait for it to fully boot up.
.....
  (gemini-2.5-flash) 

The response looks like generic troubleshooting information that's not specific to the router or the status of the LED indicator lights.

To customize the response for the specific router, you can add to the prompt the router's troubleshooting guide as context for it to refer to when providing a response.

**Prompt:** Answer the question using the text below. Respond with only the text provided.
Question: What should I do to fix my disconnected wifi? The light on my Google Wifi router is yellow and blinking slowly.

Text:
Color: Slowly pulsing yellow
What it means: There is a network error.
What to do:
Check that the Ethernet cable is connected to both your router and your modem and both devices are turned on. You might need to unplug and plug in each device again.

Color: Fast blinking yellow
What it means: You are holding down the reset button and are factory resetting this device.
What to do:
If you keep holding down the reset button, after about 12 seconds, the light will turn solid yellow. Once it is solid yellow, let go of the factory reset button.

Color: Solid yellow
What it means: Router is factory resetting.
What to do:
This can take up to 10 minutes. When it's done, the device will reset itself and start pulsing white, letting you know it's ready for setup.

Color: Solid red
What it means: Something is wrong.
What to do:
Critical failure. Factory reset the router. If the light stays red, contact Wifi customer support.
  **Response:** Check that the Ethernet cable is connected to both your router and your modem and both devices are turned on. You might need to unplug and plug in each device again.
  (gemini-2.5-flash) 

Add prefixes
------------

A prefix is a word or phrase that you add to the prompt content that can serve several purposes, depending on where you put the prefix:

*   **Input prefix:** Adding a prefix to the input signals semantically meaningful parts of the input to the model. For example, the prefixes "English:" and "French:" demarcate two different languages.
*   **Output prefix:** Even though the output is generated by the model, you can add a prefix for the output in the prompt. The output prefix gives the model information about what's expected as a response. For example, the output prefix "JSON:" signals to the model that the output should be in JSON format.
*   **Example prefix:** In few-shot prompts, adding prefixes to the examples provides labels that the model can use when generating the output, which makes it easier to parse output content.

In the following example, "Text:" is the input prefix and "The answer is:" is the output prefix.

**Prompt:** Classify the text as one of the following categories.
- large
- small
Text: Rhino
The answer is: large
Text: Mouse
The answer is: small
Text: Snail
The answer is: small
Text: Elephant
The answer is:
  **Response:** The answer is: large
  (gemini-2.5-flash) 

Break down prompts into components
----------------------------------

For use cases that require complex prompts, you can help the model manage this complexity by breaking things down into simpler components.

1.   **Break down instructions:** Instead of having many instructions in one prompt, create one prompt per instruction. You can choose which prompt to process based on the user's input.

2.   **Chain prompts:** For complex tasks that involve multiple sequential steps, make each step a prompt and chain the prompts together in a sequence. In this sequential chain of prompts, the output of one prompt in the sequence becomes the input of the next prompt. The output of the last prompt in the sequence is the final output.

3.   **Aggregate responses:** Aggregation is when you want to perform different parallel tasks on different portions of the data and aggregate the results to produce the final output. For example, you can tell the model to perform one operation on the first part of the data, perform another operation on the rest of the data and aggregate the results.

Experiment with model parameters
--------------------------------

Each call that you send to a model includes parameter values that control how the model generates a response. The model can generate different results for different parameter values. Experiment with different parameter values to get the best values for the task. The parameters available for different models may differ. The most common parameters are the following:

1.   **Max output tokens:** Specifies the maximum number of tokens that can be generated in the response. A token is approximately four characters. 100 tokens correspond to roughly 60-80 words.

2.   **Temperature:** The temperature controls the degree of randomness in token selection. The temperature is used for sampling during response generation, which occurs when `topP` and `topK` are applied. Lower temperatures are good for prompts that require a more deterministic or less open-ended response, while higher temperatures can lead to more diverse or creative results. A temperature of 0 is deterministic, meaning that the highest probability response is always selected.

3.   **`topK`:** The `topK` parameter changes how the model selects tokens for output. A `topK` of 1 means the selected token is the most probable among all the tokens in the model's vocabulary (also called greedy decoding), while a `topK` of 3 means that the next token is selected from among the 3 most probable using the temperature. For each token selection step, the `topK` tokens with the highest probabilities are sampled. Tokens are then further filtered based on `topP` with the final token selected using temperature sampling.

4.   **`topP`:** The `topP` parameter changes how the model selects tokens for output. Tokens are selected from the most to least probable until the sum of their probabilities equals the `topP` value. For example, if tokens A, B, and C have a probability of 0.3, 0.2, and 0.1 and the `topP` value is 0.5, then the model will select either A or B as the next token by using the temperature and exclude C as a candidate. The default `topP` value is 0.95.

5.   **`stop_sequences`:** Set a stop sequence to tell the model to stop generating content. A stop sequence can be any sequence of characters. Try to avoid using a sequence of characters that may appear in the generated content.

Prompt iteration strategies
---------------------------

Prompt design can sometimes require a few iterations before you consistently get the response you're looking for. This section provides guidance on some things you can try when iterating on your prompts:

1.   **Use different phrasing:** Using different words or phrasing in your prompts often yields different responses from the model even though they all mean the same thing. If you're not getting the expected results from your prompt, try rephrasing it.

Version 1:
How do I bake a pie?

Version 2:
Suggest a recipe for a pie.

Version 3:
What's a good pie recipe?
   
2.   **Switch to an analogous task:** If you can't get the model to follow your instructions for a task, try giving it instructions for an analogous task that achieves the same result.

This prompt tells the model to categorize a book by using predefined categories:

**Prompt:** Which category does The Odyssey belong to:
thriller
sci-fi
mythology
biography
  **Response:**     The Odyssey belongs to the category of **mythology**. 

    Here's why:

    * **Mythology:** The Odyssey tells the story of Odysseus, a hero from Greek mythology, and his
    journey home after the Trojan War. It features gods, monsters, and supernatural events common to
    Greek mythology.
.....
  (gemini-2.5-flash)  
The response is correct, but the model didn't stay within the bounds of the options. You also want to model to just respond with one of the options instead of in a full sentence. In this case, you can rephrase the instructions as a multiple choice question and ask the model to choose an option.

**Prompt:** Multiple choice problem: Which of the following options describes the book The Odyssey?
Options:

    *   thriller
    *   sci-fi
    *   mythology
    *   biography 

**Response:** The correct answer is **mythology**. 
(gemini-2.5-flash) 

3.   **Change the order of prompt content:** The order of the content in the prompt can sometimes affect the response. Try changing the content order and see how that affects the response.

```
Version 1:
[examples]
[context]
[input]

Version 2:
[input]
[examples]
[context]

Version 3:
[examples]
[input]
[context]
```

Fallback responses
------------------

A fallback response is a response returned by the model when either the prompt or the response triggers a safety filter. An example of a fallback response is "I'm not able to help with that, as I'm only a language model."

If the model responds with a fallback response, try increasing the temperature.

Things to avoid
---------------

*   Avoid relying on models to generate factual information.
*   Use with care on math and logic problems.

Generative models under the hood
--------------------------------

This section aims to answer the question - **_Is there randomness in generative models' responses, or are they deterministic?_**

The short answer - yes to both. When you prompt a generative model, a text response is generated in two stages. In the first stage, the generative model processes the input prompt and generates a **probability distribution** over possible tokens (words) that are likely to come next. For example, if you prompt with the input text "The dog jumped over the ... ", the generative model will produce an array of probable next words:

```
[("fence", 0.77), ("ledge", 0.12), ("blanket", 0.03), ...]
```

This process is deterministic; a generative model will produce this same distribution every time it's input the same prompt text.

In the second stage, the generative model converts these distributions into actual text responses through one of several decoding strategies. A simple decoding strategy might select the most likely token at every timestep. This process would always be deterministic. However, you could instead choose to generate a response by _randomly sampling_ over the distribution returned by the model. This process would be stochastic (random). Control the degree of randomness allowed in this decoding process by setting the temperature. A temperature of 0 means only the most likely tokens are selected, and there's no randomness. Conversely, a high temperature injects a high degree of randomness into the tokens selected by the model, leading to more unexpected, surprising model responses.

Next steps
----------

*   Now that you have a deeper understanding of prompt design, try writing your own prompts using [Google AI Studio](http://aistudio.google.com/).
*   To learn about multimodal prompting, see [Prompting with media files](https://ai.google.dev/gemini-api/docs/files#prompt-guide).
*   To learn about image prompting, see the [Imagen prompt guide](https://ai.google.dev/gemini-api/docs/image-generation#imagen-prompt-guide)
*   To learn about video prompting, see the [Veo prompt guide](https://ai.google.dev/gemini-api/docs/video#prompt-guide)
</prompting_guide>
```

<structured_output>
Title: Structured output

URL Source: https://ai.google.dev/gemini-api/docs/structured-output

Markdown Content:
[Skip to main content](https://ai.google.dev/gemini-api/docs/structured-output#main-content)

*   [Models](https://ai.google.dev/gemini-api/docs)
    *   [Gemini API docs](https://ai.google.dev/gemini-api/docs)
    *   [API Reference](https://ai.google.dev/api)
    *   [Cookbook](https://github.com/google-gemini/cookbook)
    *   [Community](https://discuss.ai.google.dev/c/gemini-api/)

*    Solutions 
*    Code assistance 
*    Showcase 
*    Community 

*   Get started

*   [Overview](https://ai.google.dev/gemini-api/docs)
*   [Quickstart](https://ai.google.dev/gemini-api/docs/quickstart)
*   [API keys](https://ai.google.dev/gemini-api/docs/api-key)
*   [Libraries](https://ai.google.dev/gemini-api/docs/libraries)
*   [Open AI compatibility](https://ai.google.dev/gemini-api/docs/openai)
*   Models

*   [All models](https://ai.google.dev/gemini-api/docs/models)
*   [Pricing](https://ai.google.dev/gemini-api/docs/pricing)
*   [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
*   [Billing info](https://ai.google.dev/gemini-api/docs/billing)
*   Model Capabilities

*   [Text generation](https://ai.google.dev/gemini-api/docs/text-generation)
*   [Image generation](https://ai.google.dev/gemini-api/docs/image-generation)
*   [Video generation](https://ai.google.dev/gemini-api/docs/video)
*   [Speech generation](https://ai.google.dev/gemini-api/docs/speech-generation)
*   [Music generation](https://ai.google.dev/gemini-api/docs/music-generation)
*   [Long context](https://ai.google.dev/gemini-api/docs/long-context)
*   [Structured output](https://ai.google.dev/gemini-api/docs/structured-output)
*   [Thinking](https://ai.google.dev/gemini-api/docs/thinking)
*   [Function calling](https://ai.google.dev/gemini-api/docs/function-calling)
*   [Document understanding](https://ai.google.dev/gemini-api/docs/document-processing)
*   [Image understanding](https://ai.google.dev/gemini-api/docs/image-understanding)
*   [Video understanding](https://ai.google.dev/gemini-api/docs/video-understanding)
*   [Audio understanding](https://ai.google.dev/gemini-api/docs/audio)
*   [Code execution](https://ai.google.dev/gemini-api/docs/code-execution)
*   [URL context](https://ai.google.dev/gemini-api/docs/url-context)
*   [Google Search](https://ai.google.dev/gemini-api/docs/google-search)
*   Guides

*   [Prompt engineering](https://ai.google.dev/gemini-api/docs/prompting-strategies)

*   [Context caching](https://ai.google.dev/gemini-api/docs/caching)
*   [Files API](https://ai.google.dev/gemini-api/docs/files)
*   [Token counting](https://ai.google.dev/gemini-api/docs/tokens)

*   [Embeddings](https://ai.google.dev/gemini-api/docs/embeddings)

*   Resources

*   [Migrate to Gen AI SDK](https://ai.google.dev/gemini-api/docs/migrate)
*   [Release notes](https://ai.google.dev/gemini-api/docs/changelog)
*   [API troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting)

*   Policies

*   [Terms of service](https://ai.google.dev/gemini-api/terms)
*   [Available regions](https://ai.google.dev/gemini-api/docs/available-regions)
*   [Additional usage polices](https://ai.google.dev/gemini-api/docs/usage-policies)

*   On this page
*   [Generating JSON](https://ai.google.dev/gemini-api/docs/structured-output#generating-json)
    *   [Configuring a schema (recommended)](https://ai.google.dev/gemini-api/docs/structured-output#configuring-a-schema)
    *   [Providing a schema in a text prompt](https://ai.google.dev/gemini-api/docs/structured-output#schema-in-text-prompt)

*   [Generating enum values](https://ai.google.dev/gemini-api/docs/structured-output#generating-enums)
*   [About JSON schemas](https://ai.google.dev/gemini-api/docs/structured-output#json-schemas)
    *   [Property ordering](https://ai.google.dev/gemini-api/docs/structured-output#property-ordering)
    *   [Schemas in Python](https://ai.google.dev/gemini-api/docs/structured-output#schemas-in-python)
    *   [JSON Schema support](https://ai.google.dev/gemini-api/docs/structured-output#json-schema)

*   [Best practices](https://ai.google.dev/gemini-api/docs/structured-output#considerations)
*   [What's next](https://ai.google.dev/gemini-api/docs/structured-output#whats-next)

You can configure Gemini for structured output instead of unstructured text, allowing precise extraction and standardization of information for further processing. For example, you can use structured output to extract information from resumes, standardize them to build a structured database.

Gemini can generate either [JSON](https://ai.google.dev/gemini-api/docs/structured-output#generating-json) or [enum values](https://ai.google.dev/gemini-api/docs/structured-output#generating-enums) as structured output.

Generating JSON
---------------

There are two ways to generate JSON using the Gemini API:

*   Configure a schema on the model
*   Provide a schema in a text prompt

Configuring a schema on the model is the **recommended** way to generate JSON, because it constrains the model to output JSON.

### Configuring a schema (recommended)

To constrain the model to generate JSON, configure a `responseSchema`. The model will then respond to any prompt with JSON-formatted output.

```
from google import genai
from pydantic import BaseModel

class Recipe(BaseModel):
    recipe_name: str
    ingredients: list[str]

client = genai.Client(api_key="GOOGLE_API_KEY")
response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents="List a few popular cookie recipes, and include the amounts of ingredients.",
    config={
        "response_mime_type": "application/json",
        "response_schema": list[Recipe],
    },
)
# Use the response as a JSON string.
print(response.text)

# Use instantiated objects.
my_recipes: list[Recipe] = response.parsed
```

```
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ "GOOGLE_API_KEY" });

async function main() {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents:
      "List a few popular cookie recipes, and include the amounts of ingredients.",
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            recipeName: {
              type: Type.STRING,
            },
            ingredients: {
              type: Type.ARRAY,
              items: {
                type: Type.STRING,
              },
            },
          },
          propertyOrdering: ["recipeName", "ingredients"],
        },
      },
    },
  });

  console.log(response.text);
}

main();
```

```
package main

import (
    "context"
    "fmt"
    "log"

    "google.golang.org/genai"
)

func main() {
    ctx := context.Background()
    client, err := genai.NewClient(ctx, &genai.ClientConfig{
        APIKey:  "GOOGLE_API_KEY",
        Backend: genai.BackendGeminiAPI,
    })
    if err != nil {
        log.Fatal(err)
    }

    config := &genai.GenerateContentConfig{
        ResponseMIMEType: "application/json",
        ResponseSchema: &genai.Schema{
            Type: genai.TypeArray,
            Items: &genai.Schema{
                Type: genai.TypeObject,
                Properties: map[string]*genai.Schema{
                    "recipeName": {Type: genai.TypeString},
                    "ingredients": {
                        Type:  genai.TypeArray,
                        Items: &genai.Schema{Type: genai.TypeString},
                    },
                },
                PropertyOrdering: []string{"recipeName", "ingredients"},
            },
        },
    }

    result, err := client.Models.GenerateContent(
        ctx,
        "gemini-2.5-flash",
        genai.Text("List a few popular cookie recipes, and include the amounts of ingredients."),
        config,
    )
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println(result.Text())
}
```

```
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$GOOGLE_API_KEY" \
-H 'Content-Type: application/json' \
-d '{
      "contents": [{
        "parts":[
          { "text": "List a few popular cookie recipes, and include the amounts of ingredients." }
        ]
      }],
      "generationConfig": {
        "responseMimeType": "application/json",
        "responseSchema": {
          "type": "ARRAY",
          "items": {
            "type": "OBJECT",
            "properties": {
              "recipeName": { "type": "STRING" },
              "ingredients": {
                "type": "ARRAY",
                "items": { "type": "STRING" }
              }
            },
            "propertyOrdering": ["recipeName", "ingredients"]
          }
        }
      }
}' 2> /dev/null | head
```

The output might look like this:

```
[
  {
    "recipeName": "Chocolate Chip Cookies",
    "ingredients": [
      "1 cup (2 sticks) unsalted butter, softened",
      "3/4 cup granulated sugar",
      "3/4 cup packed brown sugar",
      "1 teaspoon vanilla extract",
      "2 large eggs",
      "2 1/4 cups all-purpose flour",
      "1 teaspoon baking soda",
      "1 teaspoon salt",
      "2 cups chocolate chips"
    ]
  },
  ...
]
```

### Providing a schema in a text prompt

Instead of configuring a schema, you can supply a schema as natural language or pseudo-code in a text prompt. This method is **not recommended**, because it might produce lower quality output, and because the model is not constrained to follow the schema.

Here's a generic example of a schema provided in a text prompt:

```
List a few popular cookie recipes, and include the amounts of ingredients.

Produce JSON matching this specification:

Recipe = { "recipeName": string, "ingredients": array<string> }
Return: array<Recipe>
```

Since the model gets the schema from text in the prompt, you might have some flexibility in how you represent the schema. But when you supply a schema inline like this, the model is not actually constrained to return JSON. For a more deterministic, higher quality response, configure a schema on the model, and don't duplicate the schema in the text prompt.

Generating enum values
----------------------

In some cases you might want the model to choose a single option from a list of options. To implement this behavior, you can pass an _enum_ in your schema. You can use an enum option anywhere you could use a `string` in the `responseSchema`, because an enum is an array of strings. Like a JSON schema, an enum lets you constrain model output to meet the requirements of your application.

For example, assume that you're developing an application to classify musical instruments into one of five categories: `"Percussion"`, `"String"`, `"Woodwind"`, `"Brass"`, or "`"Keyboard"`". You could create an enum to help with this task.

In the following example, you pass an enum as the `responseSchema`, constraining the model to choose the most appropriate option.

```
from google import genai
import enum

class Instrument(enum.Enum):
  PERCUSSION = "Percussion"
  STRING = "String"
  WOODWIND = "Woodwind"
  BRASS = "Brass"
  KEYBOARD = "Keyboard"

client = genai.Client(api_key="GEMINI_API_KEY")
response = client.models.generate_content(
    model='gemini-2.5-flash',
    contents='What type of instrument is an oboe?',
    config={
        'response_mime_type': 'text/x.enum',
        'response_schema': Instrument,
    },
)

print(response.text)
# Woodwind
```

The Python library will translate the type declarations for the API. However, the API accepts a subset of the OpenAPI 3.0 schema ([Schema](https://ai.google.dev/api/caching#schema)).

There are two other ways to specify an enumeration. You can use a [`Literal`](https://docs.pydantic.dev/1.10/usage/types/#literal-type):

```
Literal["Percussion", "String", "Woodwind", "Brass", "Keyboard"]
```

And you can also pass the schema as JSON:

```
from google import genai

client = genai.Client(api_key="GEMINI_API_KEY")
response = client.models.generate_content(
    model='gemini-2.5-flash',
    contents='What type of instrument is an oboe?',
    config={
        'response_mime_type': 'text/x.enum',
        'response_schema': {
            "type": "STRING",
            "enum": ["Percussion", "String", "Woodwind", "Brass", "Keyboard"],
        },
    },
)

print(response.text)
# Woodwind
```

Beyond basic multiple choice problems, you can use an enum anywhere in a JSON schema. For example, you could ask the model for a list of recipe titles and use a `Grade` enum to give each title a popularity grade:

```
from google import genai

import enum
from pydantic import BaseModel

class Grade(enum.Enum):
    A_PLUS = "a+"
    A = "a"
    B = "b"
    C = "c"
    D = "d"
    F = "f"

class Recipe(BaseModel):
  recipe_name: str
  rating: Grade

client = genai.Client(api_key="GEMINI_API_KEY")
response = client.models.generate_content(
    model='gemini-2.5-flash',
    contents='List 10 home-baked cookie recipes and give them grades based on tastiness.',
    config={
        'response_mime_type': 'application/json',
        'response_schema': list[Recipe],
    },
)

print(response.text)
```

The response might look like this:

```
[
  {
    "recipe_name": "Chocolate Chip Cookies",
    "rating": "a+"
  },
  {
    "recipe_name": "Peanut Butter Cookies",
    "rating": "a"
  },
  {
    "recipe_name": "Oatmeal Raisin Cookies",
    "rating": "b"
  },
  ...
]
```

About JSON schemas
------------------

Configuring the model for JSON output using `responseSchema` parameter relies on `Schema` object to define its structure. This object represents a select subset of the [OpenAPI 3.0 Schema object](https://spec.openapis.org/oas/v3.0.3#schema-object), and also adds a `propertyOrdering` field.

Here's a pseudo-JSON representation of all the `Schema` fields:

```
{
  "type": enum (Type),
  "format": string,
  "description": string,
  "nullable": boolean,
  "enum": [
    string
  ],
  "maxItems": integer,
  "minItems": integer,
  "properties": {
    string: {
      object (Schema)
    },
    ...
  },
  "required": [
    string
  ],
  "propertyOrdering": [
    string
  ],
  "items": {
    object (Schema)
  }
}
```

The `Type` of the schema must be one of the OpenAPI [Data Types](https://spec.openapis.org/oas/v3.0.3#data-types), or a union of those types (using `anyOf`). Only a subset of fields is valid for each `Type`. The following list maps each `Type` to a subset of the fields that are valid for that type:

*   `string` ->`enum`, `format`, `nullable`
*   `integer` ->`format`, `minimum`, `maximum`, `enum`, `nullable`
*   `number` ->`format`, `minimum`, `maximum`, `enum`, `nullable`
*   `boolean` ->`nullable`
*   `array` ->`minItems`, `maxItems`, `items`, `nullable`
*   `object` ->`properties`, `required`, `propertyOrdering`, `nullable`

Here are some example schemas showing valid type-and-field combinations:

```
{ "type": "string", "enum": ["a", "b", "c"] }

{ "type": "string", "format": "date-time" }

{ "type": "integer", "format": "int64" }

{ "type": "number", "format": "double" }

{ "type": "boolean" }

{ "type": "array", "minItems": 3, "maxItems": 3, "items": { "type": ... } }

{ "type": "object",
  "properties": {
    "a": { "type": ... },
    "b": { "type": ... },
    "c": { "type": ... }
  },
  "nullable": true,
  "required": ["c"],
  "propertyOrdering": ["c", "b", "a"]
}
```

For complete documentation of the Schema fields as they're used in the Gemini API, see the [Schema reference](https://ai.google.dev/api/caching#Schema).

### Property ordering

When you're working with JSON schemas in the Gemini API, the order of properties is important. By default, the API orders properties alphabetically and does not preserve the order in which the properties are defined (although the [Google Gen AI SDKs](https://ai.google.dev/gemini-api/docs/sdks) may preserve this order). If you're providing examples to the model with a schema configured, and the property ordering of the examples is not consistent with the property ordering of the schema, the output could be rambling or unexpected.

To ensure a consistent, predictable ordering of properties, you can use the optional `propertyOrdering[]` field.

```
"propertyOrdering": ["recipeName", "ingredients"]
```

`propertyOrdering[]` – not a standard field in the OpenAPI specification – is an array of strings used to determine the order of properties in the response. By specifying the order of properties and then providing examples with properties in that same order, you can potentially improve the quality of results. `propertyOrdering` is only supported when you manually create `types.Schema`.

### Schemas in Python

When you're using the Python library, the value of `response_schema` must be one of the following:

*   A type, as you would use in a type annotation (see the Python [`typing` module](https://docs.python.org/3/library/typing.html))
*   An instance of [`genai.types.Schema`](https://googleapis.github.io/python-genai/genai.html#genai.types.Schema)
*   The `dict` equivalent of `genai.types.Schema`

The easiest way to define a schema is with a Pydantic type (as shown in the previous example):

```
config={'response_mime_type': 'application/json',
        'response_schema': list[Recipe]}
```

When you use a Pydantic type, the Python library builds out a JSON schema for you and sends it to the API. For additional examples, see the [Python library docs](https://googleapis.github.io/python-genai/index.html#json-response-schema).

The Python library supports schemas defined with the following types (where `AllowedType` is any allowed type):

*   `int`
*   `float`
*   `bool`
*   `str`
*   `list[AllowedType]`
*   `AllowedType|AllowedType|...`
*   For structured types: 
    *   `dict[str, AllowedType]`. This annotation declares all dict values to be the same type, but doesn't specify what keys should be included.
    *   User-defined [Pydantic models](https://docs.pydantic.dev/latest/concepts/models/). This approach lets you specify the key names and define different types for the values associated with each of the keys, including nested structures.

### JSON Schema support

[JSON Schema](https://json-schema.org/) is a more recent specification than OpenAPI 3.0, which the [Schema](https://ai.google.dev/api/caching#Schema) object is based on. Support for JSON Schema is available as a preview using the field [`responseJsonSchema`](https://ai.google.dev/api/generate-content#FIELDS.response_json_schema) which accepts any JSON Schema with the following limitations:

*   It only works with Gemini 2.5.
*   While all JSON Schema properties can be passed, not all are supported. See the [documentation](https://ai.google.dev/api/generate-content#FIELDS.response_json_schema) for the field for more details.
*   Recursive references can only be used as the value of a non-required object property.
*   Recursive references are unrolled to a finite degree, based on the size of the schema.
*   Schemas that contain `$ref` cannot contain any properties other than those starting with a `$`.

Here's an example of generating a JSON Schema with Pydantic and submitting it to the model:

```
curl "https://generativelanguage.googleapis.com/v1alpha/models/\
gemini-2.5-flash:generateContent?key=$GEMINI_API_KEY" \
    -H 'Content-Type: application/json' \
    -d @- <<EOF
{
  "contents": [{
    "parts":[{
      "text": "Please give a random example following this schema"
    }]
  }],
  "generationConfig": {
    "response_mime_type": "application/json",
    "response_json_schema": $(python3 - << PYEOF
from enum import Enum
from typing import List, Optional, Union, Set
from pydantic import BaseModel, Field, ConfigDict
import json

class UserRole(str, Enum):
    ADMIN = "admin"
    VIEWER = "viewer"

class Address(BaseModel):
    street: str
    city: str

class UserProfile(BaseModel):
    username: str = Field(description="User's unique name")
    age: Optional[int] = Field(ge=0, le=120)
    roles: Set[UserRole] = Field(min_items=1)
    contact: Union[Address, str]
    model_config = ConfigDict(title="User Schema")

# Generate and print the JSON Schema
print(json.dumps(UserProfile.model_json_schema(), indent=2))
PYEOF
)
  }
}
EOF
```

Passing JSON Schema directly is not yet supported when using the SDK.

Best practices
--------------

Keep the following considerations and best practices in mind when you're using a response schema:

*   The size of your response schema counts towards the input token limit.
*   By default, fields are optional, meaning the model can populate the fields or skip them. You can set fields as required to force the model to provide a value. If there's insufficient context in the associated input prompt, the model generates responses mainly based on the data it was trained on.
*   A complex schema can result in an `InvalidArgument: 400` error. Complexity might come from long property names, long array length limits, enums with many values, objects with lots of optional properties, or a combination of these factors.

If you get this error with a valid schema, make one or more of the following changes to resolve the error:

    *   Shorten property names or enum names.
    *   Flatten nested arrays.
    *   Reduce the number of properties with constraints, such as numbers with minimum and maximum limits.
    *   Reduce the number of properties with complex constraints, such as properties with complex formats like `date-time`.
    *   Reduce the number of optional properties.
    *   Reduce the number of valid values for enums.

*   If you aren't seeing the results you expect, add more context to your input prompts or revise your response schema. For example, review the model's response without structured output to see how the model responds. You can then update your response schema so that it better fits the model's output.

What's next
-----------

Now that you've learned how to generate structured output, you might want to try using Gemini API tools:

*   [Function calling](https://ai.google.dev/gemini-api/docs/function-calling)
*   [Code execution](https://ai.google.dev/gemini-api/docs/code-execution)
*   [Grounding with Google Search](https://ai.google.dev/gemini-api/docs/grounding)

Except as otherwise noted, the content of this page is licensed under the [Creative Commons Attribution 4.0 License](https://creativecommons.org/licenses/by/4.0/), and code samples are licensed under the [Apache 2.0 License](https://www.apache.org/licenses/LICENSE-2.0). For details, see the [Google Developers Site Policies](https://developers.google.com/site-policies). Java is a registered trademark of Oracle and/or its affiliates.

Last updated 2025-06-17 UTC.

</structured_output>
<prompting_strategies>
Title: Prompt design strategies

URL Source: https://ai.google.dev/gemini-api/docs/prompting-strategies

Markdown Content:
_Prompt design_ is the process of creating prompts, or natural language requests, that elicit accurate, high quality responses from a language model.

This page introduces basic concepts, strategies, and best practices to get you started designing prompts to get the most out of Gemini AI models.

Topic-specific prompt guides
----------------------------

Looking for more specific prompt strategies? Check out our other prompting guides on:

*   [Prompting with media files](https://ai.google.dev/gemini-api/docs/files#prompt-guide)
*   [Prompting for image generation](https://ai.google.dev/gemini-api/docs/image-generation#imagen-prompt-guide)
*   [Prompting for video generation](https://ai.google.dev/gemini-api/docs/video#prompt-guide)

Google AI Studio also hosts a [prompt gallery](https://aistudio.google.com/app/gallery) meant to interactively showcase many of the concepts shared in this guide.

Clear and specific instructions
-------------------------------

An effective and efficient way to customize model behavior is to provide it with clear and specific instructions. Instructions can be in the form of a question, step-by-step tasks, or as complex as mapping out a user's experience and mindset.

### Input

Input is the required text in the prompt that you want the model to provide a response to. Inputs can be a question that the model answers (question input), a task the model performs (task input), an entity the model operates on (entity input), or partial input that the model completes or continues (completion input).

| **Input type** | **Prompt** | **Generated output** |
| --- | --- | --- |
| Question | ``` What's a good name for a flower shop that specializes in selling bouquets of dried flowers? Create a list of 5 options with just the names. ``` | ``` Here are 10 names for a flower shop specializing in dried flowers: 1. Everlasting Blooms 2. Dried & Delightful 3. The Petal Preserve 4. Whispers of Wildflowers 5. Forever Blooms ``` |
| Task | Give me a simple list of just the things that I must bring on a camping trip. The list should have 5 items. | 1. **Tent:** Your shelter from the elements. 2. **Sleeping Bag:** Stay warm and comfortable. 3. **Sleeping Pad:** Insulation and cushioning for a good night's sleep. 4. **Headlamp or Flashlight:** Light for nighttime activities. 5. **First Aid Kit:** Be prepared for minor injuries. |
| Entity | ``` Classify the following items as [large, small]: Elephant Mouse Snail ``` | ``` Here's the classification: * **Elephant:** Large * **Mouse:** Small * **Snail:** Small ``` |

#### Partial input completion

Generative language models work like an advanced auto completion tool. When you provide partial content, the model can provide the rest of the content or what it thinks is a continuation of that content as a response. When doing so, if you include any examples or context, the model can take those examples or context into account.

The following example provides a prompt with an instruction and an entity input:

**Prompt:** For the given order, return a JSON object that has the fields cheeseburger, hamburger, fries, or
drink, with the value being the quantity.

Order: A burger and a drink.
  **Response:** {
  "cheeseburger": 0,
  "hamburger": 1,
  "fries": 0,
  "drink": 1
}
  (gemini-2.5-flash) 

While the model did as prompted, writing out the instructions in natural language can sometimes be challenging and it leaves a lot to the model's interpretation. For example, a restaurants menu might contain many items. To reduce the size of the JSON response, you probably want to omit the items that weren't ordered. In this case, you can give an example and a [response prefix](https://ai.google.dev/gemini-api/docs/prompting-strategies#prefixes) and let the model complete it:

**Prompt:** Valid fields are cheeseburger, hamburger, fries, and drink.
Order: Give me a cheeseburger and fries
Output:
```
{
  "cheeseburger": 1,
  "fries": 1
}
```
Order: I want two burgers, a drink, and fries.
Output:
  **Response:** ```
{
  "hamburger": 2,
  "drink": 1,
  "fries": 1
}
```
  (gemini-2.5-flash) 

Notice how "cheeseburger" was excluded from the output because it wasn't a part of the order.

### Constraints

Specify any constraints on reading the prompt or generating a response. You can tell the model what to do and not to do. For example, you can specify a constraint in the prompt on how long you want a summary to be:

**Prompt:**

**Summarize this text in one sentence:**
Text: A quantum computer exploits quantum mechanical phenomena to perform calculations exponentially
faster than any modern traditional computer. At very tiny scales, physical matter acts as both
particles and as waves, and quantum computing uses specialized hardware to leverage this behavior.
The operating principles of quantum devices is beyond the scope of classical physics. When deployed
at scale, quantum computers could be used in a wide variety of applications such as: in
cybersecurity to break existing encryption methods while helping researchers create new ones, in
meteorology to develop better weather forecasting etc. However, the current state of the art quantum
computers are still largely experimental and impractical.
    
**Response:**

      Exploiting quantum mechanical phenomena, quantum computers can perform calculations exponentially faster than traditional computers for potential applications like cybersecurity and meteorology, although they are currently largely experimental and impractical.
    (gemini-2.5-flash) 

### Response format

You can give instructions that specify the format of the response. For example, you can ask for the response to be formatted as a table, bulleted list, elevator pitch, keywords, sentence, or paragraph. The following system instruction tells the model to be more conversational in its response:

**System instruction**     All questions should be answered comprehensively with details, unless the user requests a concise response specifically.
  **Prompt**     What is a smart way to make a business that sells DVD's in 2025?
  **Response:** Starting a business selling DVDs in 2025 presents significant challenges due to the overwhelming dominance of digital streaming and on-demand services; a "smart" approach would therefore require a highly specialized niche, a strong value proposition beyond just the disc, and likely a focus on community or collector markets rather than mainstream consumption.

Here's a breakdown of what a smart DVD business in 2025 would likely entail:

1. Extreme Niche Specialization: You cannot compete with streaming libraries. Your business must focus on what digital doesn't offer easily or at all. This could include:

    * Out-of-Print & Rare Titles: Sourcing films or TV shows that have never been released digitally or are currently unavailable on major streaming platforms.
    ....
  (gemini-2.5-flash) 

#### Format responses with the completion strategy

The [completion strategy](https://ai.google.dev/gemini-api/docs/prompting-strategies#completion) can also help format the response. The following example prompts the model to create an essay outline:

**Prompt:** Create an outline for an essay about hummingbirds.
  **Response:** Here is a possible outline for an essay about hummingbirds:

I. Introduction
A. Hook: Start with a captivating fact or description about hummingbirds (e.g., their speed, iridescent colors, or tiny size).
B. Background: Briefly introduce hummingbirds – where they are found (Americas), their reputation as unique birds.
C. Thesis Statement: State the main point of the essay, which could be about the remarkable adaptations, behaviors, and ecological importance of hummingbirds.

II. Appearance and Identification
.....
  (gemini-2.5-flash) 

The prompt didn't specify the format for the outline and the model chose a format for you. To get the model to return an outline in a specific format, you can add text that represents the start of the outline and let the model complete it based on the pattern that you initiated.

**Prompt:** Create an outline for an essay about hummingbirds.
I. Introduction
   *
  **Response:** Okay, here is an outline for an essay about hummingbirds, starting from the introduction you provided:

I. Introduction
* Hook: Start with a captivating fact or description about hummingbirds (e.g., their speed, iridescent colors, or tiny size).
* Background: Briefly introduce hummingbirds – where they are found (Americas), their reputation as unique birds, and their general characteristics.
* Thesis Statement: State the main point of the essay, focusing on the remarkable adaptations, behaviors, and ecological significance that make hummingbirds extraordinary.
.....
  (gemini-2.5-flash) 

Zero-shot vs few-shot prompts
-----------------------------

You can include examples in the prompt that show the model what getting it right looks like. The model attempts to identify patterns and relationships from the examples and applies them when generating a response. Prompts that contain a few examples are called _few-shot_ prompts, while prompts that provide no examples are called _zero-shot_ prompts. Few-shot prompts are often used to regulate the formatting, phrasing, scoping, or general patterning of model responses. Use specific and varied examples to help the model narrow its focus and generate more accurate results.

We recommend to always include few-shot examples in your prompts. Prompts without few-shot examples are likely to be less effective. In fact, you can remove instructions from your prompt if your examples are clear enough in showing the task at hand.

The following zero-shot prompt asks the model to choose the best explanation.

**Prompt:** Please choose the best explanation to the question:

Question: How is snow formed?
Explanation1: Snow is formed when water vapor in the air freezes into ice
crystals in the atmosphere, which can combine and grow into snowflakes as they
fall through the atmosphere and accumulate on the ground.
Explanation2: Water vapor freezes into ice crystals forming snow.
Answer:
  **Response:** Explanation1 is the better explanation because it provides more detail on the
process, including how ice crystals combine and grow into snowflakes as they
fall through the atmosphere.
  (gemini-2.5-flash) 

If your use case requires the model to produce concise responses, you can include examples in the prompt that give preference to concise responses.

The following prompt provides two examples that show preference to the shorter explanations. In the response, you can see that the examples guided the model to choose the shorter explanation (`Explanation2`) as opposed to the longer explanation (`Explanation1`) like it did previously.

**Prompt:** Below are some examples showing a question, explanation, and answer format:

Question: Why is the sky blue?
Explanation1: The sky appears blue because of Rayleigh scattering, which causes
shorter blue wavelengths of light to be scattered more easily than longer red
wavelengths, making the sky look blue.
Explanation2: Due to Rayleigh scattering effect.
Answer: Explanation2

Question: What is the cause of earthquakes?
Explanation1: Sudden release of energy in the Earth's crust.
Explanation2: Earthquakes happen when tectonic plates suddenly slip or break
apart, causing a release of energy that creates seismic waves that can shake the
ground and cause damage.
Answer: Explanation1

Now, Answer the following question given the example formats above:

Question: How is snow formed?
Explanation1: Snow is formed when water vapor in the air freezes into ice
crystals in the atmosphere, which can combine and grow into snowflakes as they
fall through the atmosphere and accumulate on the ground.
Explanation2: Water vapor freezes into ice crystals forming snow.
Answer:
  **Response:** Answer: Explanation2
  (gemini-2.5-flash) 

### Optimal number of examples

Models like Gemini can often pick up on patterns using a few examples, though you may need to experiment with the number of examples to provide in the prompt for the best results. At the same time, if you include too many examples, the model may start to [overfit](https://developers.google.com/machine-learning/glossary#overfitting) the response to the examples.

### Patterns vs anti patterns

Using examples to show the model a pattern to follow is more effective than using examples to show the model an anti pattern to avoid.

⛔ **Negative pattern:**

**Example** Don't end haikus with a question:
Haiku are fun
A short and simple poem
Don't you enjoy them?
  

✅ **Positive pattern:**

**Example** Always end haikus with an assertion:
Haiku are fun
A short and simple poem
A joy to write
  

### Consistent formatting

Make sure that the structure and formatting of few-shot examples are the same to avoid responses with undesired formats. One of the primary objectives of adding few-shot examples in prompts is to show the model the response format. Therefore, it is essential to ensure a consistent format across all examples, especially paying attention to XML tags, white spaces, newlines, and example splitters.

Add context
-----------

You can include instructions and information in a prompt that the model needs to solve a problem, instead of assuming that the model has all of the required information. This contextual information helps the model understand the constraints and details of what you're asking for it to do.

The following example asks the model to give troubleshooting guidance for a router:

**Prompt:** What should I do to fix my disconnected wifi? **The light on my Google Wifi router is yellow and blinking slowly.**
  **Response:**   A yellow blinking light on your Google Wifi router usually indicates a problem
  with the internet connection. Here are some steps to troubleshoot and fix the
  issue:
  1. Restart your router and modem:
    - Unplug your modem from the power outlet and wait for 30 seconds.
    - Plug your modem back in and wait for it to fully boot up.
    - Unplug your Google Wifi router and wait for 30 seconds.
    - Plug your Google Wifi router back in and wait for it to fully boot up.
.....
  (gemini-2.5-flash) 

The response looks like generic troubleshooting information that's not specific to the router or the status of the LED indicator lights.

To customize the response for the specific router, you can add to the prompt the router's troubleshooting guide as context for it to refer to when providing a response.

**Prompt:** Answer the question using the text below. Respond with only the text provided.
Question: What should I do to fix my disconnected wifi? The light on my Google Wifi router is yellow and blinking slowly.

Text:
Color: Slowly pulsing yellow
What it means: There is a network error.
What to do:
Check that the Ethernet cable is connected to both your router and your modem and both devices are turned on. You might need to unplug and plug in each device again.

Color: Fast blinking yellow
What it means: You are holding down the reset button and are factory resetting this device.
What to do:
If you keep holding down the reset button, after about 12 seconds, the light will turn solid yellow. Once it is solid yellow, let go of the factory reset button.

Color: Solid yellow
What it means: Router is factory resetting.
What to do:
This can take up to 10 minutes. When it's done, the device will reset itself and start pulsing white, letting you know it's ready for setup.

Color: Solid red
What it means: Something is wrong.
What to do:
Critical failure. Factory reset the router. If the light stays red, contact Wifi customer support.
  **Response:** Check that the Ethernet cable is connected to both your router and your modem and both devices are turned on. You might need to unplug and plug in each device again.
  (gemini-2.5-flash) 

Add prefixes
------------

A prefix is a word or phrase that you add to the prompt content that can serve several purposes, depending on where you put the prefix:

*   **Input prefix:** Adding a prefix to the input signals semantically meaningful parts of the input to the model. For example, the prefixes "English:" and "French:" demarcate two different languages.
*   **Output prefix:** Even though the output is generated by the model, you can add a prefix for the output in the prompt. The output prefix gives the model information about what's expected as a response. For example, the output prefix "JSON:" signals to the model that the output should be in JSON format.
*   **Example prefix:** In few-shot prompts, adding prefixes to the examples provides labels that the model can use when generating the output, which makes it easier to parse output content.

In the following example, "Text:" is the input prefix and "The answer is:" is the output prefix.

**Prompt:** Classify the text as one of the following categories.
- large
- small
Text: Rhino
The answer is: large
Text: Mouse
The answer is: small
Text: Snail
The answer is: small
Text: Elephant
The answer is:
  **Response:** The answer is: large
  (gemini-2.5-flash) 

Break down prompts into components
----------------------------------

For use cases that require complex prompts, you can help the model manage this complexity by breaking things down into simpler components.

1.   **Break down instructions:** Instead of having many instructions in one prompt, create one prompt per instruction. You can choose which prompt to process based on the user's input.

2.   **Chain prompts:** For complex tasks that involve multiple sequential steps, make each step a prompt and chain the prompts together in a sequence. In this sequential chain of prompts, the output of one prompt in the sequence becomes the input of the next prompt. The output of the last prompt in the sequence is the final output.

3.   **Aggregate responses:** Aggregation is when you want to perform different parallel tasks on different portions of the data and aggregate the results to produce the final output. For example, you can tell the model to perform one operation on the first part of the data, perform another operation on the rest of the data and aggregate the results.

Experiment with model parameters
--------------------------------

Each call that you send to a model includes parameter values that control how the model generates a response. The model can generate different results for different parameter values. Experiment with different parameter values to get the best values for the task. The parameters available for different models may differ. The most common parameters are the following:

1.   **Max output tokens:** Specifies the maximum number of tokens that can be generated in the response. A token is approximately four characters. 100 tokens correspond to roughly 60-80 words.

2.   **Temperature:** The temperature controls the degree of randomness in token selection. The temperature is used for sampling during response generation, which occurs when `topP` and `topK` are applied. Lower temperatures are good for prompts that require a more deterministic or less open-ended response, while higher temperatures can lead to more diverse or creative results. A temperature of 0 is deterministic, meaning that the highest probability response is always selected.

3.   **`topK`:** The `topK` parameter changes how the model selects tokens for output. A `topK` of 1 means the selected token is the most probable among all the tokens in the model's vocabulary (also called greedy decoding), while a `topK` of 3 means that the next token is selected from among the 3 most probable using the temperature. For each token selection step, the `topK` tokens with the highest probabilities are sampled. Tokens are then further filtered based on `topP` with the final token selected using temperature sampling.

4.   **`topP`:** The `topP` parameter changes how the model selects tokens for output. Tokens are selected from the most to least probable until the sum of their probabilities equals the `topP` value. For example, if tokens A, B, and C have a probability of 0.3, 0.2, and 0.1 and the `topP` value is 0.5, then the model will select either A or B as the next token by using the temperature and exclude C as a candidate. The default `topP` value is 0.95.

5.   **`stop_sequences`:** Set a stop sequence to tell the model to stop generating content. A stop sequence can be any sequence of characters. Try to avoid using a sequence of characters that may appear in the generated content.

Prompt iteration strategies
---------------------------

Prompt design can sometimes require a few iterations before you consistently get the response you're looking for. This section provides guidance on some things you can try when iterating on your prompts:

1.   **Use different phrasing:** Using different words or phrasing in your prompts often yields different responses from the model even though they all mean the same thing. If you're not getting the expected results from your prompt, try rephrasing it.

Version 1:
How do I bake a pie?

Version 2:
Suggest a recipe for a pie.

Version 3:
What's a good pie recipe?
   
2.   **Switch to an analogous task:** If you can't get the model to follow your instructions for a task, try giving it instructions for an analogous task that achieves the same result.

This prompt tells the model to categorize a book by using predefined categories:

**Prompt:** Which category does The Odyssey belong to:
thriller
sci-fi
mythology
biography
  **Response:**     The Odyssey belongs to the category of **mythology**. 

    Here's why:

    * **Mythology:** The Odyssey tells the story of Odysseus, a hero from Greek mythology, and his
    journey home after the Trojan War. It features gods, monsters, and supernatural events common to
    Greek mythology.
.....
  (gemini-2.5-flash)  
The response is correct, but the model didn't stay within the bounds of the options. You also want to model to just respond with one of the options instead of in a full sentence. In this case, you can rephrase the instructions as a multiple choice question and ask the model to choose an option.

**Prompt:** Multiple choice problem: Which of the following options describes the book The Odyssey?
Options:

    *   thriller
    *   sci-fi
    *   mythology
    *   biography 

**Response:** The correct answer is **mythology**. 
(gemini-2.5-flash) 

3.   **Change the order of prompt content:** The order of the content in the prompt can sometimes affect the response. Try changing the content order and see how that affects the response.

```
Version 1:
[examples]
[context]
[input]

Version 2:
[input]
[examples]
[context]

Version 3:
[examples]
[input]
[context]
```

Fallback responses
------------------

A fallback response is a response returned by the model when either the prompt or the response triggers a safety filter. An example of a fallback response is "I'm not able to help with that, as I'm only a language model."

If the model responds with a fallback response, try increasing the temperature.

Things to avoid
---------------

*   Avoid relying on models to generate factual information.
*   Use with care on math and logic problems.

Generative models under the hood
--------------------------------

This section aims to answer the question - **_Is there randomness in generative models' responses, or are they deterministic?_**

The short answer - yes to both. When you prompt a generative model, a text response is generated in two stages. In the first stage, the generative model processes the input prompt and generates a **probability distribution** over possible tokens (words) that are likely to come next. For example, if you prompt with the input text "The dog jumped over the ... ", the generative model will produce an array of probable next words:

```
[("fence", 0.77), ("ledge", 0.12), ("blanket", 0.03), ...]
```

This process is deterministic; a generative model will produce this same distribution every time it's input the same prompt text.

In the second stage, the generative model converts these distributions into actual text responses through one of several decoding strategies. A simple decoding strategy might select the most likely token at every timestep. This process would always be deterministic. However, you could instead choose to generate a response by _randomly sampling_ over the distribution returned by the model. This process would be stochastic (random). Control the degree of randomness allowed in this decoding process by setting the temperature. A temperature of 0 means only the most likely tokens are selected, and there's no randomness. Conversely, a high temperature injects a high degree of randomness into the tokens selected by the model, leading to more unexpected, surprising model responses.

Next steps
----------

*   Now that you have a deeper understanding of prompt design, try writing your own prompts using [Google AI Studio](http://aistudio.google.com/).
*   To learn about multimodal prompting, see [Prompting with media files](https://ai.google.dev/gemini-api/docs/files#prompt-guide).
*   To learn about image prompting, see the [Imagen prompt guide](https://ai.google.dev/gemini-api/docs/image-generation#imagen-prompt-guide)
*   To learn about video prompting, see the [Veo prompt guide](https://ai.google.dev/gemini-api/docs/video#prompt-guide)
```

</prompting_strategies>
