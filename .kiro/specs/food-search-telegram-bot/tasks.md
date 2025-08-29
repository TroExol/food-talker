# Implementation Plan

- [x] 1. Set up project structure and core dependencies
  - Install Telegraf.js, database client, and other required dependencies
  - Create directory structure for models, services, bot handlers
  - Set up environment configuration and validation
  - _Requirements: 1.1, 9.1, 10.1_

- [x] 2. Implement core data models and types
  - [x] 2.1 Create TypeScript interfaces for all data models
    - Write TUser, TRestaurant, TMenuItem, TSearchResult interfaces
    - Define TStructuredQuery and supporting types
    - Create error types and enums
    - _Requirements: 1.1, 2.3, 4.1_

  - [x] 2.2 Implement validation utilities
    - Create input validation functions for search queries and user data
    - Write sanitization utilities for user inputs
    - Implement city validation for supported locations
    - _Requirements: 2.1, 3.1, 10.2_

- [x] 3. Create database layer and user management
  - [x] 3.1 Set up database schema and connection
    - Create database connection utilities with connection pooling
    - Define database tables for users, search history, restaurant cache
    - Write database migration scripts
    - _Requirements: 1.1, 9.3, 10.3_

  - [x] 3.2 Implement UserService and UserRepository
    - Code user creation, retrieval, and update methods
    - Implement subscription management and expiry checking
    - Write unit tests for user management functionality
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 4. Implement Yandex.Eda API integration
  - [x] 4.1 Create YandexEdaService based on research data
    - Implement getPlaces method using existing API patterns
    - Implement getPlaceMenu method with proper headers
    - Add rate limiting and error handling for API calls
    - _Requirements: 7.1, 7.2, 7.5_

  - [x] 4.2 Add data transformation and caching
    - Transform Yandex.Eda responses to internal data models
    - Implement caching layer for restaurant and menu data
    - Create data collection service for periodic updates
    - _Requirements: 7.3, 7.4, 9.1_

- [x] 5. Build LLM integration for natural language processing
  - [x] 5.1 Implement LLMService for query transformation
    - Create prompt templates for query structure extraction
    - Implement API client for Llama 3.1 8B integration
    - Add response validation and error handling
    - _Requirements: 2.2, 2.3, 2.6_

  - [x] 5.2 Add result enhancement capabilities
    - Add caching for LLM responses to reduce costs
    - _Requirements: 2.5, 9.1, 11.3_

- [x] 6. Create search engine
  - [x] 6.1 Implement SearchService core functionality
    - Combine LLM processing with data aggregation
    - Create search result ranking and filtering logic
    - Implement search history tracking
    - _Requirements: 2.1, 2.4, 2.6, 8.4_

- [x] 7. Develop Telegram bot handlers and middleware
  - [x] 7.1 Create basic bot setup and command handlers
    - Set up Telegraf bot with webhook/polling configuration
    - Implement /start, /help, /address, /history, /cancel commands
    - Create middleware for authentication and rate limiting
    - _Requirements: 1.1, 1.3, 8.1, 8.2, 8.3, 9.2_

  - [x] 7.2 Implement message handlers and user interaction
    - Create text message handler for search queries
    - Implement callback query handlers for inline keyboards
    - Add user registration flow and city selection
    - _Requirements: 1.2, 2.1, 8.5_

- [x] 8. Build message formatting and result display
  - [x] 8.1 Create MessageFormatter service
    - Implement search result formatting with photos and details
    - Create inline keyboard generation for "Order" buttons
    - Add pagination support for "Show more" functionality
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 8.2 Add rich message formatting
    - Implement restaurant card formatting with all required fields
    - Create error message templates for user-friendly errors
    - _Requirements: 4.1, 4.5_

- [x] 9. Implement error handling and monitoring
  - [x] 9.1 Create comprehensive error handling system
    - Add admin notification system for critical errors
    - _Requirements: 7.5, 10.4, 11.5_

- [x] 10. Create caching and performance optimization
  - [x] 10.1 Implement multi-level caching strategy
    - Implement Redis integration for distributed caching
    - Create cache invalidation strategies
    - _Requirements: 7.4, 9.1, 9.5_

- [ ] 11. Other
  - [x] 11.1 Add available to setup proxy for parsing API Yandex.Eda
  - [x] 11.2 Limit the number of user requests to 5 requests per day on Basic subscription
  - [ ] 11.3 On Basic subscripton use only vector data base
  - [ ] 11.4 On Premium subscripton use vector data base and LLM
  - [x] 11.5 Calc used tokens for user
  - [x] 11.6 Add analytics
  - [ ] 11.7 Вместо захардкоженных городов дать возможность пользователю выбирать любой город России
  - [x] 11.8 Log API requests to postgresql