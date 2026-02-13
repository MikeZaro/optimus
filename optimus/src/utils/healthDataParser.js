/**
 * Apple Health Data Parser
 * Parses JSON exports from Apple Health app
 */

/**
 * Parse Apple Health JSON export
 * @param {string} jsonString - Raw JSON from Apple Health export
 * @returns {Array} Parsed health records ready for API
 */
export const parseAppleHealthJSON = (jsonString) => {
  try {
    const json = JSON.parse(jsonString);

    if (!Array.isArray(json)) {
      throw new Error('Invalid format: expected array of health records');
    }

    return json.map(record => ({
      date: new Date(record.creationDate || record.startDate).toISOString().split('T')[0],
      time: new Date(record.startDate).toISOString(),
      type: mapAppleHealthType(record.type),
      value: parseFloat(record.value),
      unit: mapUnit(record.unit),
      metadata: {
        sourceName: record.sourceName,
        sourceVersion: record.sourceVersion,
        device: record.device,
        workoutType: record.workoutActivityType,
        duration: record.duration
      }
    }));
  } catch (error) {
    console.error('Failed to parse Apple Health JSON:', error);
    throw new Error(`Parse error: ${error.message}`);
  }
};

/**
 * Map Apple Health type identifiers to our schema
 */
const mapAppleHealthType = (appleType) => {
  const typeMap = {
    'HKQuantityTypeIdentifierStepCount': 'steps',
    'HKQuantityTypeIdentifierDistanceWalkingRunning': 'distance',
    'HKQuantityTypeIdentifierFlightsClimbed': 'flights',
    'HKCategoryTypeIdentifierSleepAnalysis': 'sleep',
    'HKQuantityTypeIdentifierHeartRate': 'heart_rate',
    'HKQuantityTypeIdentifierHeartRateVariabilitySDNN': 'heart_rate_variability',
    'HKQuantityTypeIdentifierBodyMass': 'weight',
    'HKQuantityTypeIdentifierActiveEnergyBurned': 'calories',
    'HKQuantityTypeIdentifierOxygenSaturation': 'oxygen_saturation',
    'HKWorkoutTypeIdentifier': 'workout',
    'HKQuantityTypeIdentifierBloodPressureSystolic': 'blood_pressure_systolic',
    'HKQuantityTypeIdentifierBloodPressureDiastolic': 'blood_pressure_diastolic'
  };

  return typeMap[appleType] || 'unknown';
};

/**
 * Normalize unit names
 */
const mapUnit = (appleUnit) => {
  const unitMap = {
    'count': 'steps',
    'count/min': 'bpm',
    'ms': 'ms',
    'kg': 'kg',
    'kcal': 'kcal',
    'mi': 'miles',
    'hr': 'hours',
    'min': 'minutes',
    '%': 'percent'
  };

  return unitMap[appleUnit] || appleUnit;
};

/**
 * Parse CSV export (alternative format)
 * Apple Health can export as CSV via third-party apps
 */
export const parseAppleHealthCSV = (csvString) => {
  const lines = csvString.split('\n');
  const headers = lines[0].split(',');

  return lines.slice(1)
    .filter(line => line.trim())
    .map(line => {
      const values = line.split(',');
      return {
        date: values[headers.indexOf('date')],
        time: values[headers.indexOf('time')],
        type: values[headers.indexOf('type')],
        value: parseFloat(values[headers.indexOf('value')]),
        unit: values[headers.indexOf('unit')],
        metadata: {}
      };
    });
};
