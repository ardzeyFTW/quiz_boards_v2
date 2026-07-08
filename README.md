# Premium Quiz Master

A premium static web application for practicing multiple choice questions.

## Features
- **Speedrun Mode:** Standard scoring for a quick test of knowledge.
- **Mastery Mode:** Questions repeat until answered correctly twice consecutively.
- **Persistent Storage:** Saves scores and progress locally in the browser.
- **Cloudflare Pages Ready:** Entirely client-side architecture in the public folder.

## Deployment
Set your build command to 
one (or leave it blank) and set the output directory to public.

## Structure
- /public - Contains the actual web application (HTML, CSS, JS, JSON). This is the folder you deploy.
- extract.js - Node.js script used to extract questions from PDFs via Gemini API.
