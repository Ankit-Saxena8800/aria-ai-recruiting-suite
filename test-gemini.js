require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testModel(genAI, modelName) {
  try {
    console.log(`\nTrying model: ${modelName}...`);
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent('Say "Hello from Aria!"');
    const response = await result.response;
    console.log(`✅ SUCCESS! Model "${modelName}" works!`);
    console.log(`Response: ${response.text()}`);
    return true;
  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
    return false;
  }
}

async function findWorkingModel() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  console.log('Testing Gemini API with different models...\n');

  // Try common model names
  const modelsToTry = [
    'gemini-1.5-pro-latest',
    'gemini-1.5-flash-latest',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'gemini-pro',
    'gemini-pro-vision',
    'models/gemini-1.5-pro',
    'models/gemini-1.5-flash',
    'models/gemini-pro'
  ];

  for (const modelName of modelsToTry) {
    const success = await testModel(genAI, modelName);
    if (success) {
      console.log(`\n\n🎉 USE THIS MODEL: ${modelName}\n`);
      return;
    }
  }

  console.log('\n❌ None of the models worked. Check your API key.');
}

findWorkingModel();
