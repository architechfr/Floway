import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

export function HomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.eyebrow}>FLOWAY</Text>
      <Text style={styles.title}>Le meilleur arrêt, pas seulement le plus proche.</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Prochain arrêt recommandé</Text>
        <Text style={styles.station}>Données à connecter</Text>
        <Text style={styles.metric}>Attente estimée — min</Text>
      </View>
      <Text style={styles.note}>MVP : stations + prix + attente communautaire + recommandation.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', gap: 20 },
  eyebrow: { fontSize: 14, fontWeight: '700', letterSpacing: 2 },
  title: { fontSize: 34, fontWeight: '700', lineHeight: 40 },
  card: { borderWidth: 1, borderRadius: 18, padding: 20, gap: 8 },
  label: { fontSize: 14, opacity: 0.6 },
  station: { fontSize: 24, fontWeight: '600' },
  metric: { fontSize: 18 },
  note: { fontSize: 15, opacity: 0.7 },
});
