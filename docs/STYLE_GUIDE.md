# 代碼風格指南

> 語言：廣東話 | 更新日期：2025-01-10

---

## 命名規範

### Python
- **變數 / 函數**：`snake_case`
```python
  user_name = "John"
  def get_user_by_id():
      pass
```

- **Class**：`PascalCase`
```python
  class UserService:
      pass
```

- **常數**：`UPPER_SNAKE_CASE`
```python
  MAX_RETRY = 3
  API_KEY = "xxx"
```

### JavaScript / TypeScript
- **變數 / 函數**：`camelCase`
```javascript
  const userName = "John";
  function getUserById() {}
```

- **Class / Component**：`PascalCase`
```javascript
  class UserService {}
  function UserProfile() {}
```

- **常數**：`UPPER_SNAKE_CASE`
```javascript
  const MAX_RETRY = 3;
```

---

## 檔案命名

### Python