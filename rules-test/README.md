# Pruebas de las reglas de Firestore

Comprueban que la app puede hacer lo que necesita y que los ataques típicos se bloquean
(estudiante que se pone nota, que se cambia el rol, que envía fuera de plazo, profesor ajeno, etc.).

Requisitos: Java 11 o superior (lo usa el emulador de Firebase).

```
cd rules-test
npm ci
npm test
```
