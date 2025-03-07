import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private apiUrl = 'http://localhost:5000/chat'; // Change if hosted elsewhere

  private http = inject(HttpClient);

  sendMessage(userInput: string): Observable<{ output: string }> {
    return this.http.post<{ output: string }>(this.apiUrl, { userInput });
  }
}
