import { createSignal, onMount, createEffect, Show } from 'solid-js';
import { createEvent, supabase } from './supabaseClient';
import { Auth } from '@supabase/auth-ui-solid';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { FaSolidPaperclip } from 'solid-icons/fa';

function App() {
  const [user, setUser] = createSignal(null);
  const [currentPage, setCurrentPage] = createSignal('login');
  const [fileName, setFileName] = createSignal('');
  const [summary, setSummary] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal('');

  const checkUserSignedIn = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      setUser(user);
      setCurrentPage('homePage');
    }
  };

  onMount(checkUserSignedIn);

  createEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_, session) => {
        if (session?.user) {
          setUser(session.user);
          setCurrentPage('homePage');
        } else {
          setUser(null);
          setCurrentPage('login');
        }
      }
    );

    return () => {
      authListener?.unsubscribe();
    };
  });

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setCurrentPage('login');
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setErrorMessage('');
    setSummary('');
    setLoading(true);

    const allowedExtensions = [
      'pdf',
      'doc',
      'docx',
      'xls',
      'xlsx',
      'ppt',
      'pptx',
    ];
    const fileExtension = file.name.split('.').pop().toLowerCase();

    if (!allowedExtensions.includes(fileExtension)) {
      setLoading(false);
      setErrorMessage('Unsupported file type.');
      return;
    }

    try {
      let extractedText = '';
      if (fileExtension === 'pdf') {
        extractedText = await extractTextFromPDF(file);
      } else if (
        fileExtension === 'doc' ||
        fileExtension === 'docx' ||
        fileExtension === 'ppt' ||
        fileExtension === 'pptx'
      ) {
        extractedText = await extractTextFromDocx(file);
      } else if (fileExtension === 'xls' || fileExtension === 'xlsx') {
        extractedText = await extractTextFromExcel(file);
      }

      if (!extractedText) {
        throw new Error('Could not extract text from the document.');
      }

      // Truncate to the first 5000 characters
      extractedText = extractedText.substring(0, 5000);

      const response = await createEvent('chatgpt_request', {
        prompt: `Please provide an accurate summary of the following document in less than 100 words:\n\n${extractedText}`,
        response_type: 'text',
      });

      setSummary(response);
    } catch (error) {
      console.error('Error processing file:', error);
      setErrorMessage('Error processing the document.');
    } finally {
      setLoading(false);
    }
  };

  const extractTextFromPDF = async (file) => {
    try {
      const pdfjsLib = await import('pdfjs-dist/build/pdf');
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.10.111/build/pdf.worker.min.js';

      const typedArray = new Uint8Array(await file.arrayBuffer());
      const pdf = await pdfjsLib.getDocument(typedArray).promise;
      let text = '';

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        const strings = content.items.map((item) => item.str);
        text += strings.join(' ') + '\n';
      }
      return text;
    } catch (error) {
      console.error('Error extracting text from PDF:', error);
      throw error;
    }
  };

  const extractTextFromDocx = async (file) => {
    try {
      const JSZip = await import('jszip');
      const zip = await JSZip.loadAsync(file);
      const xml = await zip.file('word/document.xml').async('text');
      const doc = new window.DOMParser().parseFromString(xml, 'application/xml');
      const texts = doc.getElementsByTagName('w:t');
      let text = '';
      for (let i = 0; i < texts.length; i++) {
        text += texts[i].textContent + ' ';
      }
      return text;
    } catch (error) {
      console.error('Error extracting text from Word document:', error);
      throw error;
    }
  };

  const extractTextFromExcel = async (file) => {
    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      let result = '';
      workbook.SheetNames.forEach(function (sheetName) {
        const roa = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
          header: 1,
        });
        if (roa.length) result += roa.join(' ') + '\n';
      });
      return result;
    } catch (error) {
      console.error('Error extracting text from Excel file:', error);
      throw error;
    }
  };

  return (
    <div class="min-h-screen bg-gradient-to-br from-purple-100 to-blue-100 p-4 text-gray-800">
      <Show
        when={currentPage() === 'homePage'}
        fallback={
          <div class="flex items-center justify-center min-h-screen">
            <div class="w-full max-w-md p-8 bg-white rounded-xl shadow-lg">
              <h2 class="text-3xl font-bold mb-6 text-center text-purple-600">
                Sign in with ZAPT
              </h2>
              <a
                href="https://www.zapt.ai"
                target="_blank"
                rel="noopener noreferrer"
                class="text-blue-500 hover:underline mb-6 block text-center"
              >
                Learn more about ZAPT
              </a>
              <Auth
                supabaseClient={supabase}
                appearance={{ theme: ThemeSupa }}
                providers={['google', 'facebook', 'apple']}
                magicLink={true}
              />
            </div>
          </div>
        }
      >
        <div class="max-w-3xl mx-auto">
          <div class="flex justify-between items-center mb-8">
            <h1 class="text-4xl font-bold text-purple-600">Document Summarizer</h1>
            <button
              class="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-6 rounded-full shadow-md focus:outline-none focus:ring-2 focus:ring-red-400 transition duration-300 ease-in-out transform hover:scale-105 cursor-pointer"
              onClick={handleSignOut}
            >
              Sign Out
            </button>
          </div>
          <div class="bg-white p-8 rounded-lg shadow-md">
            <h2 class="text-2xl font-bold mb-4 text-purple-600">Upload Document</h2>
            <Show when={!fileName()}>
              <label class="flex items-center space-x-2">
                <button
                  class="flex items-center px-6 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition duration-300 ease-in-out transform hover:scale-105 cursor-pointer focus:outline-none"
                  disabled={loading()}
                >
                  <FaSolidPaperclip class="mr-2" />
                  Choose File
                </button>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                  onChange={handleFileUpload}
                  class="hidden"
                />
              </label>
            </Show>
            <Show when={fileName()}>
              <p class="text-lg font-semibold mb-4">Selected File: {fileName()}</p>
            </Show>
            <Show when={loading()}>
              <p class="text-blue-500 font-semibold">Processing your document...</p>
            </Show>
            <Show when={errorMessage()}>
              <p class="text-red-500 font-semibold">Error: {errorMessage()}</p>
            </Show>
            <Show when={summary()}>
              <div class="mt-6">
                <h3 class="text-xl font-bold mb-2 text-purple-600">Summary</h3>
                <p class="text-gray-700 whitespace-pre-wrap">{summary()}</p>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}

export default App;