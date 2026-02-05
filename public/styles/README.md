# Aria AI Design System - Usage Guide

## Overview

This design system provides a consistent, accessible, and maintainable foundation for the Aria AI Recruiting Suite. It includes global styles, reusable components, and utility classes based on STAGE branding.

## Getting Started

### 1. Include the Stylesheets

Add these links in the `<head>` of your HTML files:

```html
<!-- Global styles (required) -->
<link rel="stylesheet" href="/styles/global.css">

<!-- Component library (optional, but recommended) -->
<link rel="stylesheet" href="/styles/components.css">

<!-- Toast notifications (if needed) -->
<link rel="stylesheet" href="/components/toast.css">
```

### 2. Order Matters

Include stylesheets in this order:
1. `global.css` (base styles and variables)
2. `components.css` (component patterns)
3. Page-specific styles
4. `toast.css` or other plugins

## CSS Variables

All design tokens are available as CSS variables:

### Colors
```css
--color-primary: #EFA73F          /* STAGE Orange */
--color-secondary: #258D58         /* STAGE Green */
--color-success: #22c55e
--color-error: #ef4444
--color-warning: #EFA73F
```

### Spacing
```css
--space-xs: 4px
--space-sm: 8px
--space-md: 16px
--space-lg: 24px
--space-xl: 32px
--space-2xl: 48px
--space-3xl: 64px
```

### Typography
```css
--font-size-xs: 12px
--font-size-sm: 14px
--font-size-base: 16px
--font-size-lg: 18px
--font-size-xl: 24px
--font-size-2xl: 32px
--font-size-3xl: 48px
```

## Components

### Buttons

```html
<!-- Primary button -->
<button class="btn btn-primary">Primary Action</button>

<!-- Secondary button -->
<button class="btn btn-secondary">Secondary Action</button>

<!-- Outline button -->
<button class="btn btn-outline">Outline</button>

<!-- Ghost button -->
<button class="btn btn-ghost">Ghost</button>

<!-- Danger button -->
<button class="btn btn-danger">Delete</button>

<!-- Button sizes -->
<button class="btn btn-primary btn-sm">Small</button>
<button class="btn btn-primary">Regular</button>
<button class="btn btn-primary btn-lg">Large</button>

<!-- Icon button -->
<button class="btn btn-primary btn-icon">✓</button>

<!-- Disabled state -->
<button class="btn btn-primary" disabled>Disabled</button>
```

### Forms

```html
<div class="form-group">
  <label class="form-label required" for="email">Email Address</label>
  <input
    type="email"
    id="email"
    class="form-input"
    placeholder="you@example.com"
    required
  >
  <div class="form-hint">We'll never share your email.</div>
  <div class="form-error">Please enter a valid email address.</div>
</div>

<div class="form-group">
  <label class="form-label" for="bio">Bio</label>
  <textarea id="bio" class="form-textarea" rows="4"></textarea>
</div>

<div class="form-group">
  <label class="form-label" for="role">Role</label>
  <select id="role" class="form-select">
    <option>Engineer</option>
    <option>Designer</option>
    <option>Manager</option>
  </select>
</div>
```

### Cards

```html
<div class="card">
  <div class="card-header">
    <h3 class="card-title">Card Title</h3>
    <p class="card-subtitle">Optional subtitle</p>
  </div>

  <div class="card-body">
    <p>Card content goes here...</p>
  </div>

  <div class="card-footer">
    <button class="btn btn-primary">Action</button>
  </div>
</div>
```

### Alerts

```html
<!-- Success alert -->
<div class="alert alert-success">
  <span>✓</span>
  <div>Operation completed successfully!</div>
</div>

<!-- Error alert -->
<div class="alert alert-error">
  <span>✕</span>
  <div>An error occurred. Please try again.</div>
</div>

<!-- Warning alert -->
<div class="alert alert-warning">
  <span>⚠</span>
  <div>Please review your input.</div>
</div>

<!-- Info alert -->
<div class="alert alert-info">
  <span>ℹ</span>
  <div>New features are available!</div>
</div>
```

### Badges

```html
<span class="badge badge-primary">Primary</span>
<span class="badge badge-success">Success</span>
<span class="badge badge-error">Error</span>
<span class="badge badge-warning">Warning</span>
<span class="badge badge-secondary">Secondary</span>
<span class="badge badge-outline">Outline</span>
```

### Tabs

```html
<div class="tabs">
  <button class="tab active">Tab 1</button>
  <button class="tab">Tab 2</button>
  <button class="tab">Tab 3</button>
</div>

<div class="tab-content active">
  Content for Tab 1
</div>

<div class="tab-content">
  Content for Tab 2
</div>

<div class="tab-content">
  Content for Tab 3
</div>
```

### Tables

```html
<div class="table-container">
  <table class="table">
    <thead>
      <tr>
        <th>Name</th>
        <th>Email</th>
        <th>Status</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>John Doe</td>
        <td>john@example.com</td>
        <td><span class="badge badge-success">Active</span></td>
        <td>
          <button class="btn btn-sm btn-ghost">Edit</button>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

### Navigation

```html
<nav class="navbar">
  <div class="navbar-content">
    <a href="/" class="navbar-brand">
      <img src="/logo.png" alt="Logo" class="navbar-logo">
      <span class="navbar-title">Aria AI</span>
    </a>

    <ul class="navbar-nav">
      <li><a href="/tools" class="navbar-link active">Tools</a></li>
      <li><a href="/admin" class="navbar-link">Admin</a></li>
      <li><button class="btn btn-primary">Logout</button></li>
    </ul>
  </div>
</nav>
```

### Modal

```html
<div class="modal-overlay">
  <div class="modal">
    <div class="modal-header">
      <h2 class="modal-title">Modal Title</h2>
      <button class="modal-close">×</button>
    </div>

    <div class="modal-body">
      <p>Modal content goes here...</p>
    </div>

    <div class="modal-footer">
      <button class="btn btn-outline">Cancel</button>
      <button class="btn btn-primary">Confirm</button>
    </div>
  </div>
</div>
```

### Dropdown

```html
<div class="dropdown">
  <button class="btn btn-outline dropdown-toggle">
    Options ▼
  </button>

  <div class="dropdown-menu">
    <button class="dropdown-item">Edit</button>
    <button class="dropdown-item">Duplicate</button>
    <div class="dropdown-divider"></div>
    <button class="dropdown-item">Delete</button>
  </div>
</div>
```

### Stats/Metrics

```html
<div class="stats-grid">
  <div class="stat-card">
    <div class="stat-label">Total Users</div>
    <div class="stat-value">1,234</div>
    <div class="stat-change positive">
      ↑ 12% from last month
    </div>
  </div>

  <div class="stat-card">
    <div class="stat-label">Active Projects</div>
    <div class="stat-value">56</div>
    <div class="stat-change negative">
      ↓ 5% from last month
    </div>
  </div>
</div>
```

### Loading States

```html
<!-- Spinner -->
<div class="loading"></div>

<!-- Skeleton loader -->
<div class="skeleton" style="height: 100px;"></div>
```

### Progress Bar

```html
<div class="progress">
  <div class="progress-bar" style="width: 75%;"></div>
</div>

<!-- Success variant -->
<div class="progress">
  <div class="progress-bar success" style="width: 100%;"></div>
</div>

<!-- Error variant -->
<div class="progress">
  <div class="progress-bar error" style="width: 50%;"></div>
</div>
```

### Empty State

```html
<div class="empty-state">
  <div class="empty-state-icon">📭</div>
  <h3 class="empty-state-title">No items found</h3>
  <p class="empty-state-description">
    Get started by creating your first item.
  </p>
  <button class="btn btn-primary">Create Item</button>
</div>
```

## Layout Utilities

### Container

```html
<!-- Standard container (1400px max) -->
<div class="container">
  Content here
</div>

<!-- Small container (800px max) -->
<div class="container container-sm">
  Narrow content
</div>

<!-- Large container (1600px max) -->
<div class="container container-lg">
  Wide content
</div>
```

### Flexbox

```html
<div class="flex items-center justify-between gap-md">
  <div>Item 1</div>
  <div>Item 2</div>
</div>

<div class="flex flex-col gap-lg">
  <div>Vertical Item 1</div>
  <div>Vertical Item 2</div>
</div>
```

### Grid

```html
<div class="grid grid-cols-3 gap-lg">
  <div>Column 1</div>
  <div>Column 2</div>
  <div>Column 3</div>
</div>
```

### Spacing

```html
<!-- Margin utilities -->
<div class="mt-lg">Margin top large</div>
<div class="mb-xl">Margin bottom extra large</div>

<!-- Padding utilities -->
<div class="p-md">Padding medium</div>
<div class="p-xl">Padding extra large</div>
```

## Accessibility

### Screen Reader Only

```html
<span class="sr-only">Hidden from visual users, read by screen readers</span>
```

### Focus Visible

```html
<button class="btn btn-primary focus-visible">
  Accessible button
</button>
```

### ARIA Labels

Always use proper ARIA attributes:

```html
<button
  class="btn btn-icon"
  aria-label="Close dialog"
  aria-pressed="false"
>
  ×
</button>

<nav aria-label="Main navigation">
  <!-- Navigation items -->
</nav>
```

## Responsive Design

All components are mobile-responsive by default. Breakpoints:

- **Desktop**: > 1024px
- **Tablet**: 768px - 1024px
- **Mobile**: < 768px
- **Small Mobile**: < 480px

### Mobile-First Approach

Components adapt automatically. For custom responsive behavior:

```css
/* Mobile first */
.my-element {
  font-size: 14px;
}

/* Tablet and up */
@media (min-width: 768px) {
  .my-element {
    font-size: 16px;
  }
}

/* Desktop and up */
@media (min-width: 1024px) {
  .my-element {
    font-size: 18px;
  }
}
```

## Best Practices

### 1. Use CSS Variables

```css
/* ✓ Good */
.my-component {
  color: var(--color-primary);
  padding: var(--space-lg);
}

/* ✗ Avoid */
.my-component {
  color: #EFA73F;
  padding: 24px;
}
```

### 2. Leverage Utility Classes

```html
<!-- ✓ Good: Use utilities for simple spacing -->
<div class="flex items-center gap-md mt-lg">
  ...
</div>

<!-- ✗ Avoid: Creating custom classes for simple layouts -->
<div class="custom-flex-container">
  ...
</div>
```

### 3. Keep Specificity Low

```css
/* ✓ Good */
.btn { ... }
.btn-primary { ... }

/* ✗ Avoid */
div.container .card .btn.btn-primary { ... }
```

### 4. Follow Naming Conventions

- Use BEM-like naming: `.block__element--modifier`
- Prefix component classes: `.btn-`, `.card-`, `.modal-`
- Use semantic names: `.btn-danger` not `.btn-red`

## Browser Support

- Chrome/Edge (last 2 versions)
- Firefox (last 2 versions)
- Safari (last 2 versions)
- Mobile Safari (iOS 12+)
- Chrome Mobile (last 2 versions)

## Migration Guide

### Updating Existing Pages

1. Add global.css and components.css to `<head>`
2. Replace inline styles with utility classes
3. Replace custom button styles with `.btn` classes
4. Replace custom form styles with `.form-*` classes
5. Test responsive behavior on mobile devices

### Example Migration

**Before:**
```html
<button style="background: #EFA73F; color: white; padding: 16px 24px; border-radius: 8px;">
  Click Me
</button>
```

**After:**
```html
<button class="btn btn-primary">
  Click Me
</button>
```

## Support

For questions or issues with the design system:
- Check this README first
- Review `/styles/global.css` for available variables
- Review `/styles/components.css` for component patterns
- Contact: ankit.saxena@stage.in
