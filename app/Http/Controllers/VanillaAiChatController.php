<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http; // Or use OpenAI PHP client if installed
use OpenAI\Laravel\Facades\OpenAI; // Use this if openai-php/client is set up

class VanillaAiChatController extends Controller
{
    public function chat(Request $request)
    {
        $request->validate([
            'message' => 'required|string|max:2000',
        ]);

        $userMessage = $request->input('message');

        // --- Option 1: Using OpenAI PHP Client (Recommended if set up) ---
        // Ensure your OPENAI_API_KEY is in .env and you've run composer require openai-php/client
        // Also, make sure you have published the OpenAI config if needed: php artisan vendor:publish --provider="OpenAI\Laravel\OpenAIServiceProvider"
        try {
            if (!config('openai.api_key') && !env('OPENAI_API_KEY')) {
                // Fallback to a canned response if API key is not configured
                return response()->json(['reply' => "Hello from Laravel! Your message was: \"{$userMessage}\". (AI not configured)"]);
            }

            $response = OpenAI::chat()->create([
                'model' => 'gpt-3.5-turbo', // Or gpt-4 if you have access
                'messages' => [
                    ['role' => 'system', 'content' => 'You are a helpful assistant.'],
                    ['role' => 'user', 'content' => $userMessage],
                ],
            ]);

            $reply = $response->choices[0]->message->content;
            return response()->json(['reply' => trim($reply)]);

        } catch (\Throwable $th) {
            // Log the error for debugging
            // Log::error('OpenAI API Error: ' . $th->getMessage());
            // Fallback to a canned response in case of an API error
            // In a real app, you might want more sophisticated error handling
            if (str_contains($th->getMessage(), 'cURL error 6')) { // Example: DNS resolution error
                 return response()->json(['reply' => "Sorry, I'm having trouble connecting to the AI service right now. Please check network or API key."]);
            }
             // Generic error if API key is missing or invalid
            if (str_contains($th->getMessage(), 'Incorrect API key provided') || str_contains($th->getMessage(), 'You didn\'t provide an API key')) {
                return response()->json(['reply' => "AI service connection error: Please ensure your API key is correctly configured in the .env file."]);
            }
            return response()->json(['reply' => "Sorry, an error occurred with the AI service. Your message was: \"{$userMessage}\". Error: " . $th->getMessage()]);
        }

        // --- Option 2: Canned response (if you don't want to use an API yet) ---
        // return response()->json(['reply' => "Hello from Laravel! You said: \"{$userMessage}\". This is a test response."]);

        // --- Option 3: Using Laravel's HTTP Client to call a generic AI API (more manual) ---
        /*
        $apiKey = env('SOME_OTHER_AI_API_KEY');
        if (!$apiKey) {
            return response()->json(['reply' => "AI API key not configured."]);
        }
        try {
            $response = Http::withHeaders([
                'Authorization' => 'Bearer ' . $apiKey,
                'Content-Type' => 'application/json',
            ])->post('https://api.example-ai.com/v1/chat', [ // Replace with actual API endpoint
                'prompt' => $userMessage,
                'max_tokens' => 150,
            ]);

            if ($response->successful()) {
                return response()->json(['reply' => $response->json()['choices'][0]['text'] ?? 'No reply generated.']);
            } else {
                return response()->json(['reply' => 'Failed to get response from AI.', 'details' => $response->body()]);
            }
        } catch (\Exception $e) {
            return response()->json(['reply' => 'Error connecting to AI service: ' . $e->getMessage()]);
        }
        */
    }
}
