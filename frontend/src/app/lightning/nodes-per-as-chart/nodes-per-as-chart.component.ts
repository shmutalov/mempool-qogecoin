import { ChangeDetectionStrategy, Component, OnInit, HostBinding } from '@angular/core';
import { EChartsOption, PieSeriesOption } from 'echarts';
import { Observable, share, tap } from 'rxjs';
import { chartColors } from 'src/app/app.constants';
import { ApiService } from 'src/app/services/api.service';
import { SeoService } from 'src/app/services/seo.service';
import { download } from 'src/app/shared/graphs.utils';

@Component({
  selector: 'app-nodes-per-as-chart',
  templateUrl: './nodes-per-as-chart.component.html',
  styleUrls: ['./nodes-per-as-chart.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NodesPerAsChartComponent implements OnInit {
  miningWindowPreference: string;

  isLoading = true;
  chartOptions: EChartsOption = {};
  chartInitOptions = {
    renderer: 'svg',
  };
  timespan = '';
  chartInstance: any = undefined;

  @HostBinding('attr.dir') dir = 'ltr';

  nodesPerAsObservable$: Observable<any>;

  constructor(
    private apiService: ApiService,
    private seoService: SeoService,
  ) {
  }

  ngOnInit(): void {
    this.seoService.setTitle($localize`Nodes per AS`);

    this.nodesPerAsObservable$ = this.apiService.getNodesPerAs()
      .pipe(
        tap(data => {
          this.isLoading = false;
          this.prepareChartOptions(data);
        }),
        share()
      );
  }

  generatePoolsChartSerieData(as) {
    const poolShareThreshold = this.isMobile() ? 2 : 1; // Do not draw pools which hashrate share is lower than that
    const data: object[] = [];
    let totalShareOther = 0;
    let totalNodeOther = 0;
    let totalEstimatedHashrateOther = 0;

    let edgeDistance: any = '10%';
    if (this.isMobile()) {
      edgeDistance = 10;
    }

    as.forEach((as) => {
      if (as.share < poolShareThreshold) {
        totalShareOther += as.share;
        totalNodeOther += as.count;
        totalEstimatedHashrateOther += as.lastEstimatedHashrate;
        return;
      }
      data.push({
        value: as.share,
        name: as.name + (this.isMobile() ? `` : ` (${as.share}%)`),
        label: {
          overflow: 'none',
          color: '#b1b1b1',
          alignTo: 'edge',
          edgeDistance: edgeDistance,
        },
        tooltip: {
          show: !this.isMobile(),
          backgroundColor: 'rgba(17, 19, 31, 1)',
          borderRadius: 4,
          shadowColor: 'rgba(0, 0, 0, 0.5)',
          textStyle: {
            color: '#b1b1b1',
          },
          borderColor: '#000',
          formatter: () => {
            return `<b style="color: white">${as.name} (${as.share}%)</b><br>` +
              $localize`${as.count.toString()} nodes`;
          }
        },
        data: as.slug,
      } as PieSeriesOption);
    });

    // 'Other'
    data.push({
      itemStyle: {
        color: 'grey',
      },
      value: totalShareOther,
      name: 'Other' + (this.isMobile() ? `` : ` (${totalShareOther.toFixed(2)}%)`),
      label: {
        overflow: 'none',
        color: '#b1b1b1',
        alignTo: 'edge',
        edgeDistance: edgeDistance
      },
      tooltip: {
        backgroundColor: 'rgba(17, 19, 31, 1)',
        borderRadius: 4,
        shadowColor: 'rgba(0, 0, 0, 0.5)',
        textStyle: {
          color: '#b1b1b1',
        },
        borderColor: '#000',
        formatter: () => {
          return `<b style="color: white">${'Other'} (${totalShareOther.toFixed(2)}%)</b><br>` +
            totalNodeOther.toString() + ` nodes`;
        }
      },
      data: 9999 as any,
    } as PieSeriesOption);

    return data;
  }

  prepareChartOptions(as) {
    let pieSize = ['20%', '80%']; // Desktop
    if (this.isMobile()) {
      pieSize = ['15%', '60%'];
    }

    this.chartOptions = {
      animation: false,
      color: chartColors,
      tooltip: {
        trigger: 'item',
        textStyle: {
          align: 'left',
        }
      },
      series: [
        {
          zlevel: 0,
          minShowLabelAngle: 3.6,
          name: 'Mining pool',
          type: 'pie',
          radius: pieSize,
          data: this.generatePoolsChartSerieData(as),
          labelLine: {
            lineStyle: {
              width: 2,
            },
          },
          label: {
            fontSize: 14,
            // formatter: (serie) => `${serie.name === 'Binance Pool' ? 'Binance\nPool' : serie.name}`,
          },
          itemStyle: {
            borderRadius: 1,
            borderWidth: 1,
            borderColor: '#000',
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 40,
              shadowColor: 'rgba(0, 0, 0, 0.75)',
            },
            labelLine: {
              lineStyle: {
                width: 3,
              }
            }
          }
        }
      ],
    };
  }

  isMobile() {
    return (window.innerWidth <= 767.98);
  }

  onChartInit(ec) {
    if (this.chartInstance !== undefined) {
      return;
    }
    this.chartInstance = ec;
  }

  onSaveChart() {
    const now = new Date();
    this.chartOptions.backgroundColor = '#11131f';
    this.chartInstance.setOption(this.chartOptions);
    download(this.chartInstance.getDataURL({
      pixelRatio: 2,
      excludeComponents: ['dataZoom'],
    }), `ln-nodes-per-as-${this.timespan}-${Math.round(now.getTime() / 1000)}.svg`);
    this.chartOptions.backgroundColor = 'none';
    this.chartInstance.setOption(this.chartOptions);
  }

  isEllipsisActive(e) {
    return (e.offsetWidth < e.scrollWidth);
  }
}

