const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const CAQ_DIR = path.join(__dirname, '../new tests/CAQ FILES');
const OUTPUT_FILE = path.join(__dirname, '../public/caq_questions.json');

let allQuestions = [];
let globalId = 0;

function parseQuzFile(content, category, subCategory) {
    // The format is essentially separated by ">><<" between questions
    const rawQuestions = content.split('>><<');
    let extractedCount = 0;

    for (let raw of rawQuestions) {
        if (!raw.trim()) continue;

        // Clean up leading/trailing markers if any
        if (raw.startsWith('multipleChoiceV2<>')) {
            raw = raw.replace('multipleChoiceV2<>', '');
        }
        
        const parts = raw.split('<>OR<>');
        if (parts.length < 2) continue;
        
        let questionText = parts[0].trim();
        let choicesStr = parts[1];
        
        // Remove trailing >><< if split didn't catch it
        if (choicesStr.endsWith('>><<')) {
            choicesStr = choicesStr.slice(0, -4);
        }

        const rawChoices = choicesStr.split('<>');
        
        let answer = '';
        let choices = [];
        
        for (let choice of rawChoices) {
            choice = choice.trim();
            if (!choice) continue;
            
            if (choice.startsWith('C')) {
                const cleanChoice = choice.substring(1);
                answer = cleanChoice;
                choices.push(cleanChoice);
            } else if (choice.startsWith('W')) {
                choices.push(choice.substring(1));
            } else {
                choices.push(choice);
            }
        }

        if (questionText && answer && choices.length > 0) {
            allQuestions.push({
                category: category,
                sub_category: subCategory,
                question_text: questionText,
                choices: choices,
                answer: answer
            });
            extractedCount++;
        }
    }
    return extractedCount;
}

function processDirectory(directory) {
    const files = fs.readdirSync(directory);
    
    for (const file of files) {
        const fullPath = path.join(directory, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            processDirectory(fullPath);
        } else if (file.endsWith('.quiz')) {
            console.log(`Processing: ${file}`);
            try {
                const relativePath = path.relative(CAQ_DIR, fullPath);
                const pathParts = relativePath.split(path.sep);
                
                let categoryName = "GENERAL";
                let subCategoryName = "UNCLASSIFIED";
                
                if (pathParts.length >= 1) {
                    categoryName = pathParts[0].toUpperCase().replace(/[^A-Z0-9]/g, '_').replace(/_+/g, '_');
                }
                
                if (pathParts.length >= 3) {
                    subCategoryName = pathParts[1].toUpperCase().replace(/[^A-Z0-9 ]/g, '_').replace(/_+/g, '_');
                } else if (pathParts.length === 2) {
                    subCategoryName = path.basename(pathParts[1], '.quiz').toUpperCase().replace(/[^A-Z0-9 ]/g, '_').replace(/_+/g, '_');
                }
                
                // Keep spaces for subCategoryName display purposes, just uppercase it
                if (pathParts.length >= 3) {
                    subCategoryName = pathParts[1].toUpperCase().replace(/_/g, ' ');
                } else if (pathParts.length === 2) {
                    subCategoryName = path.basename(pathParts[1], '.quiz').toUpperCase().replace(/_/g, ' ');
                }

                // Unzip
                const zip = new AdmZip(fullPath);
                const zipEntries = zip.getEntries();
                
                let foundQuz = false;
                for (const zipEntry of zipEntries) {
                    if (zipEntry.entryName === 'tempQuz.quz') {
                        foundQuz = true;
                        const content = zipEntry.getData().toString('utf8');
                        const count = parseQuzFile(content, categoryName, subCategoryName);
                        console.log(`  -> Extracted ${count} questions under [${categoryName}] ${subCategoryName}`);
                        break;
                    }
                }
                if (!foundQuz) {
                    console.log(`  -> No tempQuz.quz found inside ${file}`);
                }
                
            } catch (err) {
                console.error(`  -> Failed to parse ${file}: ${err.message}`);
            }
        }
    }
}

function main() {
    console.log('Starting extraction of .quiz files...');
    if (!fs.existsSync(CAQ_DIR)) {
        console.error(`Directory not found: ${CAQ_DIR}`);
        return;
    }
    
    processDirectory(CAQ_DIR);
    
    // Assign IDs
    const finalData = allQuestions.map((q, idx) => ({ ...q, id: idx }));
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalData, null, 4));
    console.log(`\nSuccessfully saved ${finalData.length} CAQ questions to ${OUTPUT_FILE}`);
}

main();
