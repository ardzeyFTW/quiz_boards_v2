const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    console.error("Missing GEMINI_API_KEY environment variable");
    process.exit(1);
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function extractFromPdfBytes(pdfBytes, topicName, startPage, endPage, attempt = 1) {
    const base64Data = Buffer.from(pdfBytes).toString('base64');
    const payload = {
        contents: [{
            parts: [
                {
                    text: `You are an expert at extracting multiple choice questions from exam PDFs. 
Please extract ALL questions from this PDF document. 
For each question, find the question text, the choices, and the correct answer.
The correct answer is usually indicated by bold text, yellow highlights, or an answer key at the end of the document.
Output the result ONLY as a valid JSON array of objects. Do not wrap in markdown tags like \`\`\`json.
Each object MUST have this exact format:
{
    "topic_name": "${topicName}",
    "question_text": "...",
    "choices": [
        "...",
        "...",
        "...",
        "..."
    ],
    "answer": "..."
}`
                },
                {
                    inlineData: {
                        mimeType: "application/pdf",
                        data: base64Data
                    }
                }
            ]
        }],
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2
        }
    };

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const text = await response.text();
            console.error(`Error from API for pages ${startPage}-${endPage}:`, text);
            if (response.status === 429 && attempt < 3) {
                console.log("Rate limited. Waiting 10s...");
                await sleep(10000);
                return extractFromPdfBytes(pdfBytes, topicName, startPage, endPage, attempt + 1);
            }
            return [];
        }

        const data = await response.json();
        const text = data.candidates[0].content.parts[0].text;
        return JSON.parse(text);
    } catch(e) {
        console.error(`Failed to parse JSON for pages ${startPage}-${endPage}:`, e.message);
        return [];
    }
}

async function processPdf(filePath, topicName, hasAnswerKeyAtEnd = false) {
    console.log(`Processing ${filePath}...`);
    const fileBytes = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(fileBytes);
    const numPages = pdfDoc.getPageCount();
    
    let allQuestions = [];
    const chunkSize = 4; // process 4 pages at a time to be safe with output tokens
    
    // For engineering management, append the last two pages (answer key) to every chunk
    let answerKeyPages = [];
    if (hasAnswerKeyAtEnd) {
        // pages 10 and 11 are indices 9 and 10 (or last two pages)
        answerKeyPages = [numPages - 2, numPages - 1];
    }
    
    for (let i = 0; i < numPages; i += chunkSize) {
        // if this chunk is just the answer key pages and we already process them, skip?
        // Actually, just process everything, if it extracts the answer key as questions it might be weird, but should be fine.
        if (hasAnswerKeyAtEnd && i >= numPages - 2) {
            break; // skip processing the answer key alone
        }

        const end = Math.min(i + chunkSize, numPages - (hasAnswerKeyAtEnd ? 2 : 0));
        console.log(`  Extracting pages ${i + 1} to ${end}...`);
        
        const chunkDoc = await PDFDocument.create();
        
        const pagesToCopy = Array.from({length: end - i}, (_, index) => i + index);
        if (hasAnswerKeyAtEnd) {
            pagesToCopy.push(...answerKeyPages);
        }

        const copiedPages = await chunkDoc.copyPages(pdfDoc, pagesToCopy);
        for (const page of copiedPages) {
            chunkDoc.addPage(page);
        }
        
        const chunkBytes = await chunkDoc.save();
        const questions = await extractFromPdfBytes(chunkBytes, topicName, i + 1, end);
        console.log(`  -> Extracted ${questions.length} questions`);
        allQuestions = allQuestions.concat(questions);
    }
    
    return allQuestions;
}

async function main() {
    const pdfs = [
        { path: 'tests/COMMUNICATIONS_FRENZEL.pdf', topic: 'COMMUNICATIONS_FRENZEL', hasAnswerKeyAtEnd: false },
        { path: 'tests/ENGINEERING-MANAGEMENT_WITH-ANSWER-KEY.pdf', topic: 'ENGINEERING_MANAGEMENT', hasAnswerKeyAtEnd: true },
        { path: 'tests/PROJECT-MANAGEMENT-MODULES.pdf', topic: 'PROJECT_MANAGEMENT', hasAnswerKeyAtEnd: false }
    ];
    
    let combinedResults = [];
    
    for (const pdf of pdfs) {
        const results = await processPdf(pdf.path, pdf.topic, pdf.hasAnswerKeyAtEnd);
        combinedResults = combinedResults.concat(results);
    }
    
    fs.writeFileSync('extracted_questions.json', JSON.stringify(combinedResults, null, 4));
    console.log(`Done! Extracted ${combinedResults.length} total questions.`);
}

main().catch(console.error);
