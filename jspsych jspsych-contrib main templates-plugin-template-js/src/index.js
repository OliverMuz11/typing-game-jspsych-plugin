var jsPsychTypingTrial = (function (jspsych) {
  "use strict";

  const info = {
    name: "typing-trial",
    version: "1.0.0",
    parameters: {
      /** Lists of words for generating sentences */
      subjects: {
        type: jspsych.ParameterType.STRING,
        array: true,
        default: [
          'I', 'You', 'He', 'She', 'They', 'We', 'Dogs', 'Cats', 
          'Birds', 'People', 'Children', 'Students', 'Teachers', 'Parents',
          'Artists', 'Scientists', 'Writers', 'Doctors', 'Players', 'Friends'
        ],
      },
      verbs: {
        type: jspsych.ParameterType.STRING,
        array: true,
        default: [
          'eat', 'run', 'jump', 'play', 'sing', 'dance', 'write', 'read',
          'watch', 'hear', 'see', 'feel', 'build', 'create', 'make', 'find',
          'love', 'help', 'teach', 'learn'
        ],
      },
      objects: {
        type: jspsych.ParameterType.STRING,
        array: true,
        default: [
          'food', 'games', 'books', 'music', 'movies', 'cards', 'toys',
          'sports', 'websites', 'papers', 'stories', 'songs', 'pictures',
          'ideas', 'words', 'lessons', 'puzzles', 'plans', 'projects', 'art'
        ],
      },
      /** Probability (0-1) of using a random letter string instead of a normal sentence */
      randomStringProbability: {
        type: jspsych.ParameterType.FLOAT,
        default: 0.5,
      },
      /** Sound mode to use (0, 1, or 2). If null, will be randomly selected for each trial */
      soundMode: {
        type: jspsych.ParameterType.INT,
        default: null, // Will be randomly set each trial
      },
      /** Maximum time allowed for the trial in milliseconds (null means no time limit) */
      trialDuration: {
        type: jspsych.ParameterType.INT,
        default: null,
      },
      /** Time to display feedback after word completion in milliseconds */
      feedbackDuration: {
        type: jspsych.ParameterType.INT,
        default: 1000,
      }
    },
    data: {
      /** The target word presented to the participant */
      target_word: {
        type: jspsych.ParameterType.STRING,
      },
      /** The text entered by the participant */
      user_input: {
        type: jspsych.ParameterType.STRING,
      },
      /** Whether the participant's input matched the target word */
      accuracy: {
        type: jspsych.ParameterType.BOOL,
      },
      /** Total time taken to complete the word in milliseconds */
      reaction_time: {
        type: jspsych.ParameterType.INT,
      },
      /** Array of key press events with timing information */
      key_press_times: {
        type: jspsych.ParameterType.OBJECT,
        array: true,
      },
      /** Array of sound condition codes for each keypress (0=immediate, 1=delayed, 2=none) */
      sound_conditions: {
        type: jspsych.ParameterType.INT,
        array: true,
      },
      /** The sound mode used for this trial (0=aligned, 1=variable, 2=mostly-aligned) */
      sound_mode: {
        type: jspsych.ParameterType.INT,
      },
      /** Whether the trial used a real sentence (true) or random string (false) */
      is_real_sentence: {
        type: jspsych.ParameterType.BOOL,
      }
    },
    citation: {
      apa: "",
      bibtex: "",
    },
  };

  /**
   * **typing-trial**
   *
   * A jsPsych plugin for measuring typing performance with variable sound feedback.
   * Participants type sentences or random letter strings while receiving auditory feedback that can be immediate, delayed, or absent.
   *
   * @author Original code adapted for jsPsych
   */
  class TypingTrialPlugin {
    constructor(jsPsych) {
      this.jsPsych = jsPsych;
    }

    trial(display_element, trial) {
      // Initialize variables
      let currentWord = '';
      let userInput = '';
      let isCorrect = true;
      let completed = false;
      let audioContext = null;
      let startTime = null;
      let endTime = null;
      let keyPressTimes = [];
      let soundConditions = [];
      let isRealSentence = true;
      
      // Randomly set sound mode for this trial if not provided
      if (trial.soundMode === null) {
        trial.soundMode = Math.floor(Math.random() * 3); // 0, 1, or 2
      }
      
      // Pre-generate 65 random letter string "sentences"
      const randomStringSentences = [];
      for (let i = 0; i < 65; i++) {
        randomStringSentences.push(generateRandomLetterSentence());
      }
      
      // Get sound mode description for display
      const getSoundModeDescription = (mode) => {
        switch(mode) {
          case 0:
            return 'Aligned (100% immediate sound)';
          case 1:
            return 'Variable (33% immediate • 33% delayed • 33% none)';
          case 2:
            return 'Mostly-Aligned (70% immediate • 15% delayed • 15% none)';
          default:
            return 'Unknown';
        }
      };
      
      // Create HTML content
      display_element.innerHTML = `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; text-align: center;">
          <div id="word-display" style="font-size: 24px; font-family: monospace; letter-spacing: 2px; margin-bottom: 20px;"></div>
          <div id="input-display" style="font-size: 24px; font-family: monospace; letter-spacing: 2px; margin-bottom: 20px;"></div>
          <div style="height: 5px; width: 100%; background-color: #ddd; border-radius: 3px; margin-bottom: 20px;">
            <div id="progress-bar" style="height: 5px; background-color: green; border-radius: 3px; width: 0%; transition: width 0.1s;"></div>
          </div>
          <div style="margin-top: 20px; font-size: 14px; color: #666;">
            Type the text above. Listen carefully to the keystrokes!
          </div>
          <div style="margin-top: 10px; font-size: 12px; color: #999;">
            Sound mode: ${getSoundModeDescription(trial.soundMode)}
          </div>
        </div>
      `;

      // Get elements
      const wordDisplay = document.getElementById('word-display');
      const inputDisplay = document.getElementById('input-display');
      const progressBar = document.getElementById('progress-bar');

      // Function to generate a random string of letters of random length between min and max
      function generateRandomString(minLength, maxLength) {
        const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
        const letters = 'abcdefghijklmnopqrstuvwxyz';
        let result = '';
        for (let i = 0; i < length; i++) {
          result += letters.charAt(Math.floor(Math.random() * letters.length));
        }
        return result;
      }
      
      // Function to generate a "sentence" of three random letter strings
      function generateRandomLetterSentence() {
        const firstWord = generateRandomString(3, 6);
        const secondWord = generateRandomString(3, 7);
        const thirdWord = generateRandomString(2, 5);
        
        return `${firstWord} ${secondWord} ${thirdWord}`;
      }

      // Function to generate a random 3-word sentence
      const generateNormalSentence = () => {
        const subject = trial.subjects[Math.floor(Math.random() * trial.subjects.length)];
        const verb = trial.verbs[Math.floor(Math.random() * trial.verbs.length)];
        const object = trial.objects[Math.floor(Math.random() * trial.objects.length)];
        
        return `${subject} ${verb} ${object}`;
      };
      
      // Function to get either a normal sentence or random letter string sentence
      const getRandomWord = () => {
        // Determine if we're using a real sentence or random letters
        isRealSentence = Math.random() > trial.randomStringProbability;
        
        if (isRealSentence) {
          return generateNormalSentence();
        } else {
          // Select a random pre-generated letter string sentence
          const randomIndex = Math.floor(Math.random() * randomStringSentences.length);
          return randomStringSentences[randomIndex];
        }
      };

      // Initialize audio context on first user interaction
      const setupAudioContext = () => {
        if (!audioContext) {
          audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
      };

      // Play sound with different conditions based on current sound mode
      const playSound = () => {
        if (!audioContext) return;
        
        const playKeystrokeSound = () => {
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          
          oscillator.type = 'triangle';
          oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
          oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1);
          
          gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
          
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          
          oscillator.start();
          oscillator.stop(audioContext.currentTime + 0.1);
        };
        
        let soundCondition = 0; // Default: immediate sound
        
        switch (trial.soundMode) {
          case 0: // Aligned Sound Mode (100% immediate)
            soundCondition = 0;
            playKeystrokeSound();
            break;
            
          case 1: // Variable Sound Mode (33% immediate, 33% delayed, 33% none)
            soundCondition = Math.floor(Math.random() * 3);
            if (soundCondition === 0) {
              playKeystrokeSound(); // Immediate sound
            } else if (soundCondition === 1) {
              setTimeout(playKeystrokeSound, 200); // Delayed sound (200ms)
            }
            // If soundCondition === 2, no sound is played
            break;
            
          case 2: // Mostly-Aligned Sound Mode (70% immediate, 15% delayed, 15% none)
            const rand = Math.random();
            if (rand < 0.7) {
              soundCondition = 0; // 70% chance of immediate sound
              playKeystrokeSound();
            } else if (rand < 0.85) {
              soundCondition = 1; // 15% chance of delayed sound
              setTimeout(playKeystrokeSound, 200);
            } else {
              soundCondition = 2; // 15% chance of no sound
            }
            break;
        }
        
        // Record the sound condition for this keypress
        soundConditions.push(soundCondition);
      };

      // Update the display
      const updateDisplay = () => {
        // Clear the displays
        wordDisplay.innerHTML = '';
        inputDisplay.innerHTML = '';
        
        // Update the displayed word with character-by-character styling
        for (let i = 0; i < currentWord.length; i++) {
          const charSpan = document.createElement('span');
          charSpan.style.display = 'inline-block';
          charSpan.style.minWidth = '20px';
          charSpan.textContent = currentWord[i];
          
          if (i < userInput.length) {
            if (userInput[i] === currentWord[i]) {
              charSpan.style.color = 'green';
              charSpan.style.fontWeight = 'bold';
            } else {
              charSpan.style.color = 'red';
              charSpan.style.fontWeight = 'bold';
            }
          }
          
          wordDisplay.appendChild(charSpan);
        }
        
        // Update progress bar
        const progress = (userInput.length / currentWord.length) * 100;
        progressBar.style.width = `${progress}%`;
        
        if (isCorrect) {
          progressBar.style.backgroundColor = 'green';
        } else {
          progressBar.style.backgroundColor = 'red';
        }
        
        // Show user input
        for (let i = 0; i < userInput.length; i++) {
          const charSpan = document.createElement('span');
          charSpan.style.display = 'inline-block';
          charSpan.style.minWidth = '20px';
          charSpan.textContent = userInput[i];
          
          if (userInput[i] === currentWord[i]) {
            charSpan.style.color = 'green';
            charSpan.style.fontWeight = 'bold';
          } else {
            charSpan.style.color = 'red';
            charSpan.style.fontWeight = 'bold';
          }
          
          inputDisplay.appendChild(charSpan);
        }
      };

      // Handle key input
      const handleKeyDown = (e) => {
        // Initialize audio context on first key press if not already done
        setupAudioContext();
        
        // Allow letters, spaces, and basic punctuation, but ignore if trial is completed
        if (!/^[a-zA-Z\s\.,!?]$/.test(e.key) || completed) return;
        
        // Record the key press time
        const keyPressTime = performance.now() - startTime;
        keyPressTimes.push({
          key: e.key,
          time: keyPressTime
        });
        
        // Play sound on keypress
        playSound();
        
        const newInput = userInput + e.key;
        userInput = newInput;
        
        // Check if input matches current word so far
        if (currentWord.startsWith(newInput)) {
          isCorrect = true;
          
          // Check if word is complete
          if (newInput === currentWord) {
            completed = true;
            endTime = performance.now();
            
            // End the trial after feedback duration
            setTimeout(() => {
              endTrial();
            }, trial.feedbackDuration);
          }
        } else {
          isCorrect = false;
        }
        
        // Update the display
        updateDisplay();
      };

      // Initialize trial with a random word
      const initializeTrial = () => {
        currentWord = getRandomWord();
        userInput = '';
        isCorrect = true;
        completed = false;
        startTime = performance.now();
        updateDisplay();
        
        // Add event listeners
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('click', setupAudioContext);
      };

      // End the trial and save data
      const endTrial = () => {
        // Remove event listeners
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('click', setupAudioContext);
        
        // Calculate reaction time and accuracy
        const reactionTime = endTime ? endTime - startTime : null;
        const accuracy = userInput === currentWord;
        
        // Save data
        var trial_data = {
          target_word: currentWord,
          user_input: userInput,
          accuracy: accuracy,
          reaction_time: reactionTime,
          key_press_times: keyPressTimes,
          sound_conditions: soundConditions,
          sound_mode: trial.soundMode,
          is_real_sentence: isRealSentence
        };
        
        // Clear the display
        display_element.innerHTML = '';
        
        // End this trial
        this.jsPsych.finishTrial(trial_data);
      };

      // Set up trial timeout if specified
      if (trial.trialDuration !== null) {
        this.jsPsych.pluginAPI.setTimeout(() => {
          if (!completed) {
            endTime = performance.now();
            endTrial();
          }
        }, trial.trialDuration);
      }

      // Initialize the trial
      initializeTrial();
    }
  }
  TypingTrialPlugin.info = info;

  return TypingTrialPlugin;
})(jsPsychModule);