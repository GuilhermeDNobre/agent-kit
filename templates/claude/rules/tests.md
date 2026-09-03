# Testes

> **Aplicabilidade:** sempre. Estas regras são princípios independentes de stack.
> Os exemplos de código são ilustrativos e não definem a linguagem do projeto.
> Ver `.claude/rules/README.md`.

## Framework

O framework de testes é uma decisão do projeto e ainda não foi tomada. Qualquer que seja o
escolhido, ele precisa suportar os princípios desta página: suítes isoladas, mocks de tempo e
relatório de cobertura.

O exemplo usa Jest apenas para ilustrar a forma dos cenários e expectativas.

**Exemplo:**
```typescript
import { describe, it, expect } from '@jest/globals';

describe('UserService', () => {
  it('should create a new user', () => {
    const user = createUser({ name: 'John', email: 'john@example.com' });
    expect(user.name).toBe('John');
  });
});
```

## Execução

O comando de execução dos testes será definido junto com a stack e registrado no `CLAUDE.md`.
Enquanto não existir, **não afirme que os testes rodaram** — não há suíte para executar.

Exemplo de como ficaria com npm:
```bash
npm test
```

## Independência

Não crie dependência entre os testes. Deve ser possível rodar cada um deles de forma independente.

**Exemplo:**
```typescript
// ❌ Evite
let sharedUser: User;

it('should create user', () => {
  sharedUser = createUser({ name: 'John' });
});

it('should update user', () => {
  // depende do teste anterior
  updateUser(sharedUser.id, { name: 'Jane' });
});

// ✅ Prefira
it('should create user', () => {
  const user = createUser({ name: 'John' });
  expect(user.name).toBe('John');
});

it('should update user', () => {
  const user = createUser({ name: 'John' });
  const updated = updateUser(user.id, { name: 'Jane' });
  expect(updated.name).toBe('Jane');
});
```

## Estrutura AAA/GWT

Siga o princípio **Arrange, Act, Assert** ou **Given, When, Then** para garantir o máximo de organização e legibilidade dentro dos testes.

**Exemplo:**
```typescript
it('should calculate total price with discount', () => {
  // Arrange (Given)
  const items = [
    { price: 100, quantity: 2 },
    { price: 50, quantity: 1 }
  ];
  const discountPercentage = 10;
  
  // Act (When)
  const total = calculateTotal(items, discountPercentage);
  
  // Assert (Then)
  expect(total).toBe(225); // (200 + 50) * 0.9
});
```

## Mocks e Tempo

Se estiver testando algum comportamento que depende de um Date, e isso for importante para o que estiver sendo testado, utilize um Mock para garantir que o teste seja repetível.

**Exemplo:**
```typescript
import { jest } from '@jest/globals';

it('should set created date correctly', () => {
  // Arrange
  const mockDate = new Date('2024-01-01T12:00:00Z');
  jest.spyOn(global, 'Date').mockImplementation(() => mockDate);
  
  // Act
  const user = createUser({ name: 'John' });
  
  // Assert
  expect(user.createdAt).toEqual(mockDate);
  
  // Cleanup
  jest.restoreAllMocks();
});
```

## Foco e Clareza

Foque em testar um comportamento por teste. Evite escrever testes muito grandes.

**Exemplo:**
```typescript
// ❌ Evite
it('should handle user operations', () => {
  const user = createUser({ name: 'John' });
  expect(user.name).toBe('John');
  
  const updated = updateUser(user.id, { email: 'john@example.com' });
  expect(updated.email).toBe('john@example.com');
  
  deleteUser(user.id);
  const deleted = getUser(user.id);
  expect(deleted).toBeNull();
});

// ✅ Prefira
describe('UserService', () => {
  it('should create a new user', () => {
    const user = createUser({ name: 'John' });
    expect(user.name).toBe('John');
  });
  
  it('should update user email', () => {
    const user = createUser({ name: 'John' });
    const updated = updateUser(user.id, { email: 'john@example.com' });
    expect(updated.email).toBe('john@example.com');
  });
  
  it('should delete user', () => {
    const user = createUser({ name: 'John' });
    deleteUser(user.id);
    const deleted = getUser(user.id);
    expect(deleted).toBeNull();
  });
});
```

## Cobertura

Garanta que o código que está sendo escrito esteja totalmente coberto por testes.

**Exemplo:**
```typescript
// Para verificar cobertura
npm test -- --coverage

// Configure no package.json
{
  "jest": {
    "coverageThreshold": {
      "global": {
        "branches": 80,
        "functions": 80,
        "lines": 80,
        "statements": 80
      }
    }
  }
}
```

## Expectativas Consistentes

Crie expectativas consistentes, garantindo que tudo que estiver sendo testado está de fato sendo conferido.

**Exemplo:**
```typescript
// ❌ Evite
it('should create user with full details', () => {
  const user = createUser({ 
    name: 'John',
    email: 'john@example.com',
    age: 30 
  });
  expect(user.name).toBe('John');
  // faltou testar email e age
});

// ✅ Prefira
it('should create user with full details', () => {
  const user = createUser({ 
    name: 'John',
    email: 'john@example.com',
    age: 30 
  });
  expect(user.name).toBe('John');
  expect(user.email).toBe('john@example.com');
  expect(user.age).toBe(30);
  expect(user.id).toBeDefined();
  expect(user.createdAt).toBeInstanceOf(Date);
});
```

## Nomenclatura de Testes

Use descrições claras e descritivas que expliquem o comportamento esperado.

**Exemplo:**
```typescript
// ❌ Evite
it('test user', () => {});
it('works', () => {});

// ✅ Prefira
it('should create user with valid email', () => {});
it('should throw error when email is invalid', () => {});
it('should return null when user not found', () => {});
```
