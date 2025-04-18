var jsPsychTypingTrial = (function (jspsych) {
  "use strict";

  const info = {
    name: "typing-trial",
    version: "1.0.0",
    parameters: {
      /** The sentence or text string to be typed */
      sentence: {
        type: jspsych.ParameterType.STRING,
        default: null,
        required: true
      },
      /** Sound mode to use (0, 1, or 2) */
      soundMode: {
        type: jspsych.ParameterType.INT,
        default: 0
      },
      /** Maximum time allowed for the trial in milliseconds (null means no time limit) */
      trialDuration: {
        type: jspsych.ParameterType.INT,
        default: 15000, // 15 seconds default timeout
      },
      /** Time to display feedback after word completion in milliseconds */
      feedbackDuration: {
        type: jspsych.ParameterType.INT,
        default: 1000,
      }
    },
    data: {
      /** The target sentence presented to the participant */
      target_sentence: {
        type: jspsych.ParameterType.STRING,
      },
      /** The text entered by the participant */
      user_input: {
        type: jspsych.ParameterType.STRING,
      },
      /** Whether the participant's input matched the target sentence */
      accuracy: {
        type: jspsych.ParameterType.BOOL,
      },
      /** Total time taken to complete the sentence in milliseconds */
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
      /** Whether any errors were made during typing */
      had_errors: {
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
   * Participants type sentences while receiving auditory feedback that can be immediate, delayed, or absent.
   *
   * @author Original code adapted for jsPsych
   */
  class TypingTrialPlugin {
    constructor(jsPsych) {
      this.jsPsych = jsPsych;
    }

    trial(display_element, trial) {
      // Check if required parameter is present
      if (trial.sentence === null) {
        console.error("Required parameter 'sentence' missing in typing-trial");
        this.jsPsych.finishTrial({});
        return;
      }

      // Initialize variables
      let currentSentence = trial.sentence;
      let userInput = '';
      let isCorrect = true;
      let completed = false;
      let audioContext = null;
      let startTime = null;
      let endTime = null;
      let keyPressTimes = [];
      let soundConditions = [];
      let hadErrors = false;
      
      // Create HTML content with error message area (keeping the div but not using it)
      display_element.innerHTML = `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; text-align: center;">
          <div id="word-display" style="font-size: 24px; font-family: monospace; letter-spacing: 2px; margin-bottom: 20px;"></div>
          <div id="input-display" style="font-size: 24px; font-family: monospace; letter-spacing: 2px; margin-bottom: 20px;"></div>
          <div style="height: 5px; width: 100%; background-color: #ddd; border-radius: 3px; margin-bottom: 20px;">
            <div id="progress-bar" style="height: 5px; background-color: green; border-radius: 3px; width: 0%; transition: width 0.1s;"></div>
          </div>
          <div id="error-message" style="font-size: 18px; height: 18px;"></div>
          <div style="margin-top: 20px; font-size: 14px; color: #666;">
            Type the text above. Listen carefully to the keystrokes!
          </div>
        </div>
      `;

      // Get elements
      const wordDisplay = document.getElementById('word-display');
      const inputDisplay = document.getElementById('input-display');
      const progressBar = document.getElementById('progress-bar');
      const errorMessage = document.getElementById('error-message');

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
        for (let i = 0; i < currentSentence.length; i++) {
          const charSpan = document.createElement('span');
          charSpan.style.display = 'inline-block';
          charSpan.style.minWidth = '20px';
          charSpan.textContent = currentSentence[i];
          
          if (i < userInput.length) {
            if (userInput[i] === currentSentence[i]) {
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
        const progress = (userInput.length / currentSentence.length) * 100;
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
          
          if (userInput[i] === currentSentence[i]) {
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
        
        // Check if this input would match the current position
        const currentPosition = userInput.length;
        const correctCharAtPosition = currentSentence[currentPosition];
        
        if (e.key !== correctCharAtPosition) {
          // Character doesn't match - just update flags, no error message display
          isCorrect = false;
          hadErrors = true;
          // Removed: errorMessage.textContent = "Incorrect";
        }
        
        userInput = newInput;
        
        // Check if we've reached the end of the sentence (right or wrong)
        if (userInput.length === currentSentence.length) {
          completed = true;
          endTime = performance.now();
          
          // End the trial after feedback duration
          setTimeout(() => {
            endTrial();
          }, trial.feedbackDuration);
        }
        
        // Update the display
        updateDisplay();
      };

      // Initialize trial
      const initializeTrial = () => {
        userInput = '';
        isCorrect = true;
        hadErrors = false;
        completed = false;
        startTime = performance.now();
        errorMessage.textContent = ""; // Clear any error message
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
        const accuracy = userInput === currentSentence;
        
        // Save data
        var trial_data = {
          target_sentence: currentSentence,
          user_input: userInput,
          accuracy: accuracy,
          reaction_time: reactionTime,
          key_press_times: keyPressTimes,
          sound_conditions: soundConditions,
          sound_mode: trial.soundMode,
          had_errors: hadErrors
        };
        
        // Clear the display
        display_element.innerHTML = '';
        
        // End this trial
        this.jsPsych.finishTrial(trial_data);
      };

      // Set up trial timeout - default to 10 seconds if not specified
      const timeoutDuration = trial.trialDuration !== null ? trial.trialDuration : 10000;
      this.jsPsych.pluginAPI.setTimeout(() => {
        if (!completed) {
          endTime = performance.now();
          endTrial();
        }
      }, timeoutDuration);

      // Initialize the trial
      initializeTrial();
    }
  }
  TypingTrialPlugin.info = info;

  return TypingTrialPlugin;
})(jsPsychModule);
