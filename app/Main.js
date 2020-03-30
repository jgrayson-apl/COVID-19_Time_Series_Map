/*
  Copyright 2017 Esri

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.​
*/

define([
  "calcite",
  "dojo/_base/declare",
  "ApplicationBase/ApplicationBase",
  "dojo/i18n!./nls/resources",
  "ApplicationBase/support/itemUtils",
  "ApplicationBase/support/domHelper",
  "dojo/_base/Color",
  "dojo/colors",
  "dojo/number",
  "dojo/date",
  "dojo/date/locale",
  "dojo/on",
  "dojo/query",
  "dojo/dom",
  "dojo/dom-class",
  "dojo/dom-construct",
  "esri/identity/IdentityManager",
  "esri/core/Evented",
  "esri/core/watchUtils",
  "esri/core/promiseUtils",
  "esri/portal/Portal",
  "esri/layers/Layer",
  "esri/layers/CSVLayer",
  "esri/renderers/smartMapping/symbology/color",
  "esri/renderers/smartMapping/creators/univariateColorSize",
  "esri/geometry/Extent",
  "esri/geometry/Multipoint",
  "esri/Graphic",
  "esri/widgets/TimeSlider",
  "esri/widgets/Home",
  "esri/widgets/LayerList",
  "esri/widgets/Legend",
  "esri/widgets/Expand",
  "dojox/charting/Chart",
  "dojox/charting/axis2d/Default",
  "dojox/charting/plot2d/Grid",
  "dojox/charting/themes/Bahamation",
  "dojox/charting/plot2d/StackedColumns",
  "dojox/charting/plot2d/Indicator",
  "dojox/charting/action2d/Tooltip",
], function(calcite, declare, ApplicationBase, i18n, itemUtils, domHelper,
            Color, colors, number, date, locale, on, query, dom, domClass, domConstruct,
            IdentityManager, Evented, watchUtils, promiseUtils, Portal,
            Layer, CSVLayer, colorSchemes, colorAndSizeRendererCreator, Extent, Multipoint,
            Graphic, TimeSlider, Home, LayerList, Legend, Expand,
            Chart, Default, Grid, ChartTheme, StackedColumns, Indicator, ChartTooltip){

  return declare([Evented], {

    /**
     *
     */
    constructor: function(){
      // BASE //
      this.base = null;
      // CALCITE WEB //
      calcite.init();
    },

    /**
     *
     * @param base
     */
    init: function(base){
      if(!base){
        console.error("ApplicationBase is not defined");
        return;
      }
      this.base = base;

      domHelper.setPageLocale(this.base.locale);
      domHelper.setPageDirection(this.base.direction);

      const webMapItems = this.base.results.webMapItems;
      const webSceneItems = this.base.results.webSceneItems;
      const validItems = webMapItems.concat(webSceneItems).reduce((list, response) => {
        if(response.value){
          list.push(response.value);
        } else {
          if(response.error && (response.error.name === "identity-manager:not-authorized")){
            IdentityManager.destroyCredentials();
            this.base.portal = new Portal({ url: this.base.config.portalUrl, authMode: "immediate" });
          }
        }
        return list;
      }, []);
      const firstItem = (validItems && validItems.length) ? validItems[0] : null;
      if(!firstItem){
        console.error("Could not load an item to display");
        return;
      }

      this.base.config.title = (this.base.config.title || itemUtils.getItemTitle(firstItem));
      domHelper.setPageTitle(this.base.config.title);

      const viewProperties = itemUtils.getConfigViewProperties(this.base.config);
      viewProperties.container = "view-node";
      viewProperties.constraints = { snapToZoom: true };

      const portalItem = this.base.results.applicationItem.value;
      const appProxies = (portalItem && portalItem.appProxies) ? portalItem.appProxies : null;

      itemUtils.createMapFromItem({ item: firstItem, appProxies: appProxies }).then(map => {
        viewProperties.map = map;
        itemUtils.createView(viewProperties).then(view => {
          view.when(() => {
            this.viewReady(this.base.config, firstItem, view).then(() => {
              /* ... */
            });
          });
        });
      });
    },

    /**
     *
     * @param config
     * @param item
     * @param view
     */
    viewReady: function(config, item, view){

      // TITLE //
      dom.byId("app-title-node").innerHTML = config.title;

      // LOADING //
      /*const updating_node = domConstruct.create("div", { className: "view-loading-node loader" });
      domConstruct.create("div", { className: "loader-bars" }, updating_node);
      domConstruct.create("div", { className: "loader-text font-size--3 text-white", innerHTML: "Updating..." }, updating_node);
      view.ui.add(updating_node, "bottom-right");
      watchUtils.init(view, "updating", (updating) => {
        domClass.toggle(updating_node, "is-active", updating);
      });*/

      // USER SIGN IN //
      return this.initializeUserSignIn().catch(console.warn).then(() => {

        // POPUP DOCKING OPTIONS //
        view.popup.defaultPopupTemplateEnabled = true;
        view.popup.dockEnabled = true;
        view.popup.dockOptions = {
          buttonEnabled: false,
          breakpoint: false,
          position: "top-center"
        };

        // HOME //
        const home = new Home({ view: view });
        view.ui.add(home, { position: "top-left", index: 0 });

        // APPLICATION READY //
        this.applicationReady(view);

      });

    },

    /**
     *
     * @returns {*}
     */
    initializeUserSignIn: function(){

      const checkSignInStatus = () => {
        return IdentityManager.checkSignInStatus(this.base.portal.url).then(userSignIn).catch(userSignOut).then();
      };
      IdentityManager.on("credential-create", checkSignInStatus);

      // SIGN IN NODE //
      const signInNode = dom.byId("sign-in-node");
      const userNode = dom.byId("user-node");

      // UPDATE UI //
      const updateSignInUI = () => {
        if(this.base.portal.user){
          dom.byId("user-firstname-node").innerHTML = this.base.portal.user.fullName.split(" ")[0];
          dom.byId("user-fullname-node").innerHTML = this.base.portal.user.fullName;
          dom.byId("username-node").innerHTML = this.base.portal.user.username;
          dom.byId("user-thumb-node").src = this.base.portal.user.thumbnailUrl;
          domClass.add(signInNode, "hide");
          domClass.remove(userNode, "hide");
        } else {
          domClass.remove(signInNode, "hide");
          domClass.add(userNode, "hide");
        }
        return promiseUtils.resolve();
      };

      // SIGN IN //
      const userSignIn = () => {
        this.base.portal = new Portal({ url: this.base.config.portalUrl, authMode: "immediate" });
        return this.base.portal.load().then(() => {
          this.emit("portal-user-change", {});
          return updateSignInUI();
        }).catch(console.warn).then();
      };

      // SIGN OUT //
      const userSignOut = () => {
        IdentityManager.destroyCredentials();
        this.base.portal = new Portal({});
        return this.base.portal.load().then(() => {
          this.base.portal.user = null;
          this.emit("portal-user-change", {});
          return updateSignInUI();
        }).catch(console.warn).then();

      };

      // USER SIGN IN //
      on(signInNode, "click", userSignIn);

      // SIGN OUT NODE //
      const signOutNode = dom.byId("sign-out-node");
      if(signOutNode){
        on(signOutNode, "click", userSignOut);
      }

      return checkSignInStatus();
    },


    /**
     * APPLICATION READY
     *
     * @param view
     */
    applicationReady: function(view){


      const legend = new Legend({ container: 'legend-container', view: view });

      const countriesLayer = view.map.layers.find(layer => {
        return (layer.title === "World Countries");
      });
      countriesLayer.load().then(() => {
        view.whenLayerView(countriesLayer).then(countriesLayerView => {
          // INITIAL COUNTRY FILTER //
          countriesLayerView.effect = { filter: { where: '1=1' }, includedEffect: "opacity(10%)" };

          const casesLayer = view.map.layers.find(layer => {
            return (layer.title === "COVID-19 Cases");
          });
          casesLayer.load().then(() => {
            casesLayer.set({ copyright: "Johns Hopkins University", outFields: ["*"] });
            //console.info('timeInfo: ', casesLayer.timeInfo);

            view.whenLayerView(casesLayer).then(casesLayerView => {

              const sliderContainer = document.getElementById("slider-container");
              const confirmedCount = document.getElementById("confirmed-count");
              const recoveredCount = document.getElementById("recovered-count");
              const deathsCount = document.getElementById("deaths-count");
              const allCountriesList = document.getElementById("country-list");
              const dateLabel = document.getElementById("date-label");
              const dateFormat = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' });


              const updateCasesChart = () => {

                const countryQuery = casesLayerView.createQuery();
                countryQuery.set({
                  extent: view.extent,
                  groupByFieldsForStatistics: ["date"],
                  orderByFields: ['date ASC'],
                  outStatistics: [
                    { statisticType: "sum", onStatisticField: "confirmed", outStatisticFieldName: "confirmed" },
                    { statisticType: "sum", onStatisticField: "deaths", outStatisticFieldName: "deaths" },
                    { statisticType: "sum", onStatisticField: "recovered", outStatisticFieldName: "recovered" }
                  ]
                });
                casesLayer.queryFeatures(countryQuery).then(totalCountByDateFS => {
                  //console.info("totalCountByDateFS: ", totalCountByDateFS);

                  const chartData = totalCountByDateFS.features.reduce((data, feature, fetureIdx) => {

                    const shortDateLabel = new Date(feature.attributes.date).toLocaleDateString('default', { month: 'short', day: 'numeric' });
                    const longDateLabel = new Date(feature.attributes.date).toLocaleDateString('default', { month: 'long', day: 'numeric' });

                    const tooltip = `${longDateLabel}
                                      <br>Deaths: ${feature.attributes.deaths.toLocaleString()}                                      
                                      <br>Confirmed: ${feature.attributes.confirmed.toLocaleString()}
                                      <br>Recovered: ${feature.attributes.recovered.toLocaleString()}`;

                    const info = {
                      x: fetureIdx,
                      label: shortDateLabel,
                      tooltip: tooltip
                    };

                    data.confirmed.push({
                      ...info,
                      y: feature.attributes.confirmed
                    });

                    data.deaths.push({
                      ...info,
                      y: feature.attributes.deaths
                    });

                    data.recovered.push({
                      ...info,
                      y: feature.attributes.recovered
                    });

                    return data;
                  }, { confirmed: [], deaths: [], recovered: [] });

                  this.initializeChart(chartData);
                });

              };
              updateCasesChart();


              const updateCaseTypeStats = () => {

                const totalQuery = casesLayerView.createQuery();
                totalQuery.set({
                  extent: view.extent,
                  timeExtent: view.timeExtent,
                  outStatistics: [
                    { statisticType: "sum", onStatisticField: "confirmed", outStatisticFieldName: "ConfirmedSum" },
                    { statisticType: "sum", onStatisticField: "deaths", outStatisticFieldName: "DeathsSum" },
                    { statisticType: "sum", onStatisticField: "recovered", outStatisticFieldName: "RecoveredSum" }
                  ]
                });
                casesLayerView.queryFeatures(totalQuery).then(totalCountFS => {
                  const stats = totalCountFS.features[0].attributes;
                  confirmedCount.innerText = stats.ConfirmedSum.toLocaleString();
                  recoveredCount.innerText = stats.RecoveredSum.toLocaleString();
                  deathsCount.innerText = stats.DeathsSum.toLocaleString();
                });

                const countryQuery = casesLayerView.createQuery();
                countryQuery.set({
                  extent: view.extent,
                  timeExtent: view.timeExtent,
                  groupByFieldsForStatistics: ["country_region"],
                  outStatistics: [
                    { statisticType: "sum", onStatisticField: "confirmed", outStatisticFieldName: "ConfirmedSum" },
                    { statisticType: "sum", onStatisticField: "deaths", outStatisticFieldName: "DeathsSum" },
                    { statisticType: "sum", onStatisticField: "recovered", outStatisticFieldName: "RecoveredSum" }
                  ]
                });
                casesLayerView.queryFeatures(countryQuery).then(totalCountFS => {

                  const countryStats = totalCountFS.features.sort((a, b) => {
                    return b.attributes.ConfirmedSum - a.attributes.ConfirmedSum;
                  });

                  allCountriesList.innerHTML = "";
                  countryStats.forEach(countryFeature => {
                    const stats = countryFeature.attributes;

                    const countryRow = domConstruct.create("tr", {}, allCountriesList);
                    domConstruct.create("td", { innerHTML: stats.country_region }, countryRow);
                    domConstruct.create("td", {
                      className: "stat-cell",
                      innerHTML: `<div>${stats.ConfirmedSum.toLocaleString()}</div>`
                    }, countryRow);
                    domConstruct.create("td", {
                      className: "stat-cell",
                      innerHTML: `<div>${stats.DeathsSum.toLocaleString()}</div>`
                    }, countryRow);
                    domConstruct.create("td", {
                      className: "stat-cell",
                      innerHTML: `<div>${stats.RecoveredSum.toLocaleString()}</div>`
                    }, countryRow);

                    /*
                    const countryItem = domConstruct.create("li", {}, allCountriesList);
                    domConstruct.create("div", { className: "avenir-demi font-size-0", innerHTML: stats.Country_Region }, countryItem);
                    const countryList = domConstruct.create("ol", { className: 'list-numbered' }, countryItem);
                    domConstruct.create("li", { innerHTML: `Confirmed: ${stats.ConfirmedSum.toLocaleString()}` }, countryList);
                    domConstruct.create("li", { innerHTML: `Deaths: ${stats.DeathsSum.toLocaleString()}` }, countryList);
                    domConstruct.create("li", { innerHTML: `Recovered: ${stats.RecoveredSum.toLocaleString()}` }, countryList);
                    */
                  });

                });

                const locationQuery = casesLayerView.createQuery();
                totalQuery.set({
                  extent: view.extent,
                  timeExtent: view.timeExtent,
                  outFields: [casesLayer.objectIdField],
                  returnGeometry: true
                });
                casesLayerView.queryFeatures(locationQuery).then(locationsFS => {
                  if(locationsFS.features.length){
                    const locations = new Multipoint({
                      spatialReference: locationsFS.spatialReference,
                      points: locationsFS.features.map(f => [f.geometry.x, f.geometry.y])
                    });
                    countriesLayerView.effect = {
                      filter: { geometry: locations },
                      excludedEffect: "opacity(10%)"
                    };
                  }
                });


              };

              const timeInfo = casesLayer.timeInfo;
              const animationTimeExtent = timeInfo.fullTimeExtent;
              const firstDate = animationTimeExtent.start;

              const timeSlider = new TimeSlider({
                container: sliderContainer,
                mode: "instant",
                playRate: 1500,
                fullTimeExtent: animationTimeExtent,
                stops: { interval: { unit: 'days', value: 1 } },
                values: [firstDate]
              });
              timeSlider.watch("timeExtent", timeExtent => {

                view.timeExtent = {
                  start: timeExtent.start,
                  end: date.add(timeExtent.start, 'hour', 22)
                };

                updateCaseTypeStats();
                dateLabel.innerText = dateFormat.format(timeExtent.start);
              });

              watchUtils.whenFalseOnce(casesLayerView, 'updating', () => {
                setTimeout(() => { timeSlider.play(); }, 2500);
              });

            });
          });

        });
      });

    },

    /**
     *
     * @param chartData
     */
    initializeChart: function(chartData){
      //console.info(chartData);

      const fontColor = "#004575";
      const lineStroke = { color: "#999999", width: 1.0, length: 5 };

      const casesChart = new Chart("chart-node", { margins: { l: 0, t: 0, r: 0, b: 0 } });
      casesChart.setTheme(ChartTheme);
      casesChart.fill = casesChart.theme.plotarea.fill = "transparent";

      casesChart.addAxis("y", {
        natural: true,
        includeZero: true,
        fixUpper: "major",
        vertical: true,
        minorTicks: false,
        majorTick: lineStroke,
        stroke: lineStroke,
        font: "normal normal normal 9pt Avenir Next",
        fontColor: fontColor,
        labelFunc: (text, value, precision) => {
          let label = text;
          switch(true){
            case (value === 0):
              label = '0';
              break;
            case (value < 1000000.0):
              label = `${Math.floor(value / 1000.0)} k`;
              break;
            default:
              label = `${Math.floor(value / 1000000.0)} m`;
          }
          return label;
        }
      });


      casesChart.addAxis("x", {
        natural: true,
        htmlLabels: true,
        minorTicks: false,
        majorTick: lineStroke,
        majorTickStep: 7,
        stroke: lineStroke,
        font: "normal normal normal 9pt Avenir Next",
        fontColor: fontColor,
        labelFunc: (text, value, precision) => {
          let label = '';
          const data = casesChart.series[0].data;
          if(data != null){
            const val = Math.floor(Number(text));
            const infoItem = data.find(info => info.x === val);
            if(infoItem){
              label = infoItem.label;
            }
          }
          return label;
        }
      });

      // DEFAULT PLOT //
      casesChart.addPlot("default", { type: StackedColumns, gap: 2, maxBarSize: 12 });

      // GRID LINES //
      casesChart.addPlot("grid", {
        type: Grid,
        hMajorLines: true,
        hMinorLines: false,
        vMajorLines: false,
        vMinorLines: false,
        majorHLine: { color: "rgba(204,204,204,0.5)", width: 1.0 }
      });

      // DATA SERIES //
      casesChart.addSeries("recovered", chartData.recovered, { stroke: { width: 0.0 }, fill: "limegreen" });
      casesChart.addSeries("confirmed", chartData.confirmed, { stroke: { width: 0.0 }, fill: "#004575" });
      casesChart.addSeries("deaths", chartData.deaths, { stroke: { width: 0.0 }, fill: "red" });

      // TOOLTIP //
      new ChartTooltip(casesChart, "default", {});

      // RENDER CHART //
      casesChart.render();

      // RESIZE //
      window.addEventListener('resize', () => { casesChart.resize(); });
    }

  });
});



