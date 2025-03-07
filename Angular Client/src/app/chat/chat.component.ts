import { Component, signal, ViewChild, ElementRef, AfterViewChecked, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../api.service';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css'],
})
export class ChatComponent implements AfterViewChecked {
  @ViewChild('chatContainer') chatContainer!: ElementRef;
  messages = signal<{ role: string; text: string }[]>([]);
  userInput = '';
  isBotProcessing: boolean = false;
  suggestions: string[] = [];
  selectedSuggestionIndex: number = -1; // Track selected suggestion

  constructor(private apiService: ApiService) {}

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  onUserTyping() {
    const input = this.userInput.toLowerCase();

    const messages: { [key: string]: string } = {
      'create': 'Create a table named `table_name` with columns: `col_1_name`, `col_2_name`, etc.',
      'add': 'Insert data into `table_name` with values: `col_1_value`, `col_2_value`, etc.',
      'update': 'Update `table_name` by setting `column_name = value` where `condition` applies.',
      'remove': 'Delete records from `table_name` where `condition` applies.',
      'search': 'Retrieve data from `table_name` where `column_name = value`.',
      'join': 'Perform an inner join on `table_1` and `table_2` using `table_1.col_name = table_2.col_name`.'
    };

    // Define aliases without duplication
    const aliasMap: { [key: string]: string } = {
      'insert': 'add',
      'delete': 'remove',
      'find': 'search'
    };

    // Merge aliases into `messages`
    const templates: { [key: string]: string } = { ...messages };
    Object.entries(aliasMap).forEach(([alias, original]) => {
      templates[alias] = messages[original];
    });

    // Get unique values when displaying all
    const uniqueTemplates = Array.from(new Set(Object.values(templates)));



    this.suggestions = Object.entries(templates)
      .filter(([key]) => key.startsWith(input))
      .map(([_, value]) => value);

    this.selectedSuggestionIndex = -1; // Reset selection when new suggestions appear
  }

  selectSuggestion(suggestion: string) {
    this.userInput = suggestion;
    this.suggestions = []; // Hide suggestions after selection
    this.selectedSuggestionIndex = -1;
  }

  sendMessage() {
    if (!this.userInput.trim()) return;

    const userMessage = this.userInput;
    this.messages.update((msgs) => [...msgs, { role: 'user', text: userMessage }]);
    this.userInput = '';
    this.suggestions = []; // Clear suggestions after sending
    this.selectedSuggestionIndex = -1;

    this.isBotProcessing = true;

    this.apiService.sendMessage(userMessage).subscribe({
      next: (response: { output: string }) => {
        this.messages.update((msgs) => [...msgs, { role: 'assistant', text: response.output }]);
        this.isBotProcessing = false;
      },
      error: (err: any) => {
        console.error('Error:', err);
        this.isBotProcessing = false;
      },
    });
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    if (this.suggestions.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.selectedSuggestionIndex = (this.selectedSuggestionIndex + 1) % this.suggestions.length;
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.selectedSuggestionIndex =
        this.selectedSuggestionIndex <= 0 ? this.suggestions.length - 1 : this.selectedSuggestionIndex - 1;
    } else if (event.key === 'Enter' && this.selectedSuggestionIndex !== -1) {
      event.preventDefault();
      this.selectSuggestion(this.suggestions[this.selectedSuggestionIndex]);
    }
  }
  @HostListener('document:click', ['$event'])
handleOutsideClick(event: Event) {
  const inputElement = document.querySelector('.msger-input');
  if (inputElement && !inputElement.contains(event.target as Node)) {
    this.suggestions = [];
    this.selectedSuggestionIndex = -1;
  }
}


  private scrollToBottom() {
    try {
      this.chatContainer.nativeElement.scrollTop = this.chatContainer.nativeElement.scrollHeight;
    } catch (err) {
      console.error('Error scrolling:', err);
    }
  }
}
