import { Injectable } from "@angular/core";
import { Configuration, OpenAIApi } from "openai";
import { MeasurementType } from "./shared/Enums/measurement-type";
import { APIService } from "./api.service";
import { SharedDataService } from "./shared-data.service";
import { TranslateService } from "@ngx-translate/core";
import { Subject } from "rxjs";
import { AlertifyService } from "./alertify.service";

@Injectable({
  providedIn: "root",
})
export class OpenaiService {
  configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY || "",
  });
  openai = new OpenAIApi(this.configuration);
  private chatCompletion: any;
  private dataToParseForAI: string;
  private model: any;
  private arrayToEvaluate = [];
  private messages = [];
  array = [];
  modelCreated = new Subject<string>();
  dataNotExist = new Subject<boolean>();

  constructor(
    private apiService: APIService,
    private sharedDataService: SharedDataService,
    private translateSvc: TranslateService,
    private alertify: AlertifyService
  ) {
    //this.loadData();
  }

  loadData(hasAdditionalDetails = false, isHealthKitData = false) {
    let dataParsedForAI = "";
    if (!isHealthKitData) {
      var bioData = this.groupByMeasurementTypeAndDate(hasAdditionalDetails);
      console.log(bioData);
      if (this.array && this.array[0])
        dataParsedForAI = "For " + this.array[0].date + ":\n" + bioData;
      this.model = dataParsedForAI;
      if (dataParsedForAI != "") {
        dataParsedForAI += "\n";
        dataParsedForAI += " ";
      }
    } else if (this.array && this.array[0]) {
      dataParsedForAI =
        "For " +
        this.getFormatedDate(new Date()) +
        "\n" +
        this.array.join("<br/>");
      this.modelCreated.next(dataParsedForAI);
    }
    var j = 0;
    for (var i = 0; i < JSON.stringify(dataParsedForAI).length; i += 5000) {
      j++;
      this.apiService.logMessage(
        "HEALTHKIT data to save",
        " - final data: loggedDataByDate " +
          j.toString() +
          " : " +
          JSON.stringify(dataParsedForAI).substr(i, 5000)
      );
    }
    this.dataToParseForAI = dataParsedForAI;
    return dataParsedForAI;
  }

  async getChatGPRResponse2(answer = null, isInitialEvaluation) {
    console.log(answer);
    console.log("index: " + isInitialEvaluation);
    this.apiService.logMessage(
      "Wellcheck.ai evaluation for pacient with pacientId: " +
        this.sharedDataService.getLoginData().patient.patientID +
        ", number of call " +
        (isInitialEvaluation ? "1" : "2"),
      JSON.stringify(answer ? answer : "")
    );
    try {
      if (isInitialEvaluation) {
        this.messages = [
          {
            role: "system",
            content: `
              As a virtual Aviation Medical Examiner, evaluate pilots' mental health using biometric data and well-being answers
              Use physiological metrics formatted as '<HeartRate>:min:75,max:85,avg:79#January9,2023' and evaluate well-being using '<Chills>:Yes'.
              Based on the input value provide a 'GAD-7, 'PHQ-8' or 'no' simple answer, with no additional words, that indicates all of the test that should be performed if any. If the pilot presents symptoms that can be evaluated by multiple surveys, suggest all surveys please.
              `,
          },
        ];
      } else if (!isInitialEvaluation) {
        this.messages = [
          {
            role: "system",
            content: `
            Monitor pilots health as a digital Aviation Medical Examiner, employing biometrics, wellness responses, and mental health scores such as PHQ-8 or GAD-7 when required. 
            Use physiological metrics in the format " 02/12/2024: <Oxygen Saturation %>: Avg: 92%; Max: 100%; Min: 82%; Number of reading: 75; Out of the [100%-90%] range:[05:01:88%; 07:25:86%; 11:20:89%; 22:16:82%] " indicating the date, the min, max, avg values, the out of normal values and their time; if unprovided, proceed without them. Focus on the correlation between sleep, oxygen and heart rate, to determine any sleep apnea scenarios (when oxygen level is below 92% and the heart rate decreases).
            Assess wellness through "<Chills>:Yes". Asses mental health though the scores "<GAD-7>:21"
            Ground pilots immediately for symptoms such as Fever/Chills, Chest pain, Diarrhea, Dizziness, Fainting or Memory loss, inappropriate medication, any alcohol intake, 'Do Not Fly' reaction test result, usage of 'Do Not Fly Medication' medication or the possible existence of 2 or more apnea situations per night.
            
            Provide a brief "fly-No-Fly" analysis using collected health data, of less than 200 words, but more than 100 words, excluding duplicate details - include physiologic health metrics, reaction test score should be included if present,  and possible mental health scores. If the reaction test has been included please add "[rts]" at the end of the reaction analysis.
            Communicate "fly" decisions as "<u>Blue skies, enjoy the flight.</u>", and "no-fly" ones as "<u>Take care of your health today, flying is for another day.</u>" and communicate apnea diagnoses if found.
            `,
          },
        ];
      } //else {
      this.messages.push({
        role: "user",
        content: answer.replace("<br/>", ""),
      });
      //}
      console.log(this.messages);
      this.chatCompletion = await this.openai.createChatCompletion({
        model: "gpt-4", //"gpt-3.5-turbo-0125", //"gpt-4",
        messages: this.messages,
      });
      this.apiService.logMessage("AI response success", null);

      this.messages.push({
        role: "system",
        content: this.chatCompletion.data.choices[0].message.content.toString(),
      });

      return this.chatCompletion.data.choices[0].message.content.toString();
    } catch (error) {
      this.apiService.logMessage("AI response error", JSON.stringify(error));
      if (error.response) {
        console.log(error.response.status);
        console.log(error.response.data);
      } else {
        console.log(error.message);
      }
    }
    return "Model can't be evaluated.";
  }

  getModel() {
    return this.arrayToEvaluate;
  }

  setArray(array, hasAdditionalDetails, isHealthKitData) {
    try {
      this.apiService.logMessage("Set array", JSON.stringify(array));
      if (array && array.length > 0) {
        this.array = array;
        let loginData = this.sharedDataService.getLoginData();
        if (loginData.IsPatientForAdditionalLogging) {
          var j = 0;
          for (var i = 0; i < JSON.stringify(array).length; i += 5000) {
            j++;
            this.apiService.logMessage(
              "HEALTHKIT data to parse for ai model",
              " - final data: loggedDataByDate " +
                j.toString() +
                " : " +
                JSON.stringify(array).substr(i, 5000)
            );
          }
        }
        return this.loadData(hasAdditionalDetails, isHealthKitData);
      } else {
        this.alertify.errorMessage(
          "Cannot proceed with the evaluation as there are no biometric parameters available!"
        );
        this.dataNotExist.next(true);
        return null;
      }
    } catch (ex) {
      this.apiService.logMessage("Set array error", JSON.stringify(ex));
    }
  }

  getFormatedDate(date: Date) {
    return (
      "#" +
      date.toLocaleString("default", { month: "long" }) +
      " " +
      date.getDate() +
      ", " +
      date.getFullYear() +
      ";"
    );
  }

  getValuesForTheDay(dataArray: Array<unknown>, date: Date): string {
    var response: string = "";
    dataArray.forEach((p) => {
      response += (p as string).replace(";", "/") + ", ";
    });
    response = response.substring(0, response.length - 2);
    response += this.getFormatedDate(date);
    return response;
  }

  getValueForTheDay(min, max, average, count, date: Date): string {
    var response: string;
    if (count >= 2)
      response =
        "min:" +
        min +
        ",max:" +
        max +
        ",avg:" +
        (Math.round(+average * 100) / 100).toFixed(2) +
        this.getFormatedDate(date);
    else response = min + this.getFormatedDate(date);
    return response;
  }

  groupByMeasurementTypeAndDate(hasAdditionalDetails = false) {
    try {
      const mp = new Map();
      let openAIQuestion = "";
      var min, max, average;
      var dataArray: Array<unknown>;

      const calculateAverage = (array: number[]): number => {
        const sum = array.reduce((a: number, b: number): number => +a + +b);
        return sum / array.length;
      };

      this.array.forEach((byDate) => {
        let grouppedByMeasurement = byDate.healthData.reduce(
          (result, currentValue) => {
            (result[currentValue.measurementType] =
              result[currentValue.measurementType] || []).push(currentValue);
            return result;
          },
          {}
        );
        for (const [key, value] of Object.entries(grouppedByMeasurement)) {
          const date = new Date(value[0].date);
          dataArray = (value as Array<unknown>).map(function (o) {
            if (!hasAdditionalDetails)
              return !isNaN(o["data"]) ? (o["data"] as number) : o["data"];
            else return o["fullDeatails"];
          });
          dataArray = dataArray.filter((elem) => elem != null);
          if (!hasAdditionalDetails) {
            if (dataArray.length > 0 && +key != MeasurementType.BloodPressure) {
              max = Math.max.apply(Math, dataArray);
              min = Math.min.apply(Math, dataArray);
              average = calculateAverage(dataArray as Array<number>);
            } else {
              min = null;
              max = null;
              average = null;
            }

            if (!mp.get(key)) {
              if (min != null && max != null && average != null) {
                mp.set(key, []);
              }
            }

            if (
              (min != null &&
                max != null &&
                average != null &&
                +key != MeasurementType.BloodPressure) ||
              +key == MeasurementType.BloodPressure
            ) {
              let array = mp.get(key);
              if (!array) array = [];
              if (+key != MeasurementType.BloodPressure)
                array.push(
                  this.getValueForTheDay(
                    min,
                    max,
                    average,
                    dataArray.length,
                    date
                  )
                );
              else {
                array.push(this.getValuesForTheDay(dataArray, date));
              }
              mp.delete(key);
              mp.set(key, array);
            }
          } else {
            if (!mp.get(key)) {
              mp.set(key, []);
            }
            let array = mp.get(key);
            array.push(dataArray[0]);
            mp.delete(key);
            mp.set(key, array);
          }
        }
      });
      mp.forEach((value, key) => {
        if (
          key in
          [
            MeasurementType.Height,
            MeasurementType.Steps,
            MeasurementType.Distance,
            MeasurementType.TotalSleep,
            MeasurementType.Awaken,
            MeasurementType.DeepSleep,
            MeasurementType.CoreSleep,
            MeasurementType.CoreSleep,
            MeasurementType.REMSleep,
            MeasurementType.DistanceWalkingRunning,
            MeasurementType.OxygenSaturation,
            MeasurementType.VO2MAX,
            MeasurementType.HeartRate,
            MeasurementType.HeartRateAggregate,
            MeasurementType.BloodPressure,
            MeasurementType.BloodPressureSystolic,
            MeasurementType.BloodPressureDiastolic,
            MeasurementType.BloodGlucose,
            MeasurementType.Weight,
            MeasurementType.BMI,
            MeasurementType.CaloriesBurned,
            MeasurementType.Calories,
            MeasurementType.CalorieIntake,
            MeasurementType.BodyFat,
          ]
        )
          if (openAIQuestion != "")
            openAIQuestion = openAIQuestion + "\n" + "<br/>";
        switch (+key) {
          case MeasurementType.Height:
            openAIQuestion =
              openAIQuestion + "<Height>:" + value.toString() + "<br/>";
            break;
          case MeasurementType.Steps:
            openAIQuestion =
              openAIQuestion + "<Steps>:" + value.toString() + "<br/>";
            break;
          case MeasurementType.Distance:
            openAIQuestion =
              openAIQuestion + "<Distance>:" + value.toString() + "<br/>";
            break;
          case MeasurementType.TotalSleep:
            openAIQuestion =
              openAIQuestion + "<Total sleep>:" + value.toString() + "<br/>";
            break;
          case MeasurementType.Awaken:
            openAIQuestion =
              openAIQuestion +
              "<Sleep Phase Awake>:" +
              value.toString() +
              "<br/>";
            break;
          case MeasurementType.DeepSleep:
            openAIQuestion =
              openAIQuestion +
              "<Sleep Phase Deep>:" +
              value.toString() +
              "<br/>";
            break;
          case MeasurementType.CoreSleep:
            openAIQuestion =
              openAIQuestion + "Core Sleep: " + value.toString() + "<br/>";
            break;
          case MeasurementType.REMSleep:
            openAIQuestion =
              openAIQuestion + "REM Sleep: " + value.toString() + "<br/>";
            break;
          case MeasurementType.DistanceWalkingRunning:
            openAIQuestion =
              openAIQuestion +
              "<Distance Walking Running>:" +
              value.toString() +
              "<br/>";
            break;
          case MeasurementType.OxygenSaturation:
            openAIQuestion =
              openAIQuestion +
              "<Oxygen Saturation>:" +
              value.toString() +
              "<br/>";
            break;
          case MeasurementType.VO2MAX:
            openAIQuestion =
              openAIQuestion + "<VO2MAX>:" + value.toString() + "<br/>";
            break;
          case MeasurementType.HeartRate:
            openAIQuestion =
              openAIQuestion + "<Heart Rate>:" + value.toString() + "<br/>";
            break;
          case MeasurementType.HeartRateAggregate:
            openAIQuestion =
              openAIQuestion +
              "<Heart Rate Aggregate>:" +
              value.toString() +
              "<br/>";
            break;
          case MeasurementType.BloodPressure:
            openAIQuestion =
              openAIQuestion + "<Blood Pressure>:" + value.toString() + "<br/>";
            break;
          case MeasurementType.BloodPressureSystolic:
            openAIQuestion =
              openAIQuestion +
              "<Blood Pressure Systolic (mmHg)>:" +
              value.toString() +
              "<br/>";
            break;
          case MeasurementType.BloodPressureDiastolic:
            openAIQuestion =
              openAIQuestion +
              "<Blood Pressure Diastolic (mmHg)>:" +
              value.toString() +
              "<br/>";
            break;
          case MeasurementType.BloodGlucose:
            openAIQuestion =
              openAIQuestion + "<Blood Glucose>:" + value.toString() + "<br/>";
            break;
          case MeasurementType.Weight:
            openAIQuestion =
              openAIQuestion + "<Weight>:" + value.toString() + "<br/>";
            break;
          case MeasurementType.BMI:
            openAIQuestion =
              openAIQuestion + "<BMI>:" + value.toString() + "<br/>";
            break;
          case MeasurementType.CaloriesBurned:
            openAIQuestion =
              openAIQuestion +
              "<Calories Burned>:" +
              value.toString() +
              "<br/>";
            break;
          case MeasurementType.Calories:
            openAIQuestion =
              openAIQuestion + "<Calories>:" + value.toString() + "<br/>";
            break;
          case MeasurementType.CalorieIntake:
            openAIQuestion =
              openAIQuestion +
              "<Calories Intake>:" +
              value.toString() +
              "<br/>";
            break;
          case MeasurementType.BodyFat:
            openAIQuestion =
              openAIQuestion + "<Body Fat (%)>:" + value.toString() + "<br/>";
            break;
          default:
            break;
        }
      });
      return openAIQuestion + "<br/>";
    } catch (error) {
      this.apiService.logMessage(
        "Error creating model for AI",
        JSON.stringify(error)
      );
    }
  }
}
